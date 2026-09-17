import type { PushSubscription } from 'web-push';
import { PushStore, PushError } from './store.js';
import { trustedPushEndpoint } from './validation.js';

export type Deliver=(subscription:PushSubscription,payload:string)=>Promise<unknown>;

// Metrics collection for monitoring push delivery health
interface PushMetrics {
  deliveriesAttempted: number;
  deliveriesSuccessful: number;
  deliveriesFailed: number;
  retriesAttempted: number;
  lastReset: number;
}
const metrics: PushMetrics = {
  deliveriesAttempted: 0,
  deliveriesSuccessful: 0,
  deliveriesFailed: 0,
  retriesAttempted: 0,
  lastReset: Date.now()
};

// Circuit breaker pattern to prevent cascading failures when push service is down
interface CircuitBreaker {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  timeout: number;
}
const circuitBreaker: CircuitBreaker = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  timeout: 60000 // 1 minute
};

function resetCircuitBreaker(): void {
  circuitBreaker.failures = 0;
  circuitBreaker.isOpen = false;
  console.log('push_circuit_breaker_reset: Push service recovered, normal operations resumed');
}

function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= 5 && !circuitBreaker.isOpen) {
    circuitBreaker.isOpen = true;
    console.error('push_circuit_breaker_opened: Too many push delivery failures, temporarily disabling push notifications');
  }
}

function checkCircuitBreaker(): void {
  if (circuitBreaker.isOpen && Date.now() - circuitBreaker.lastFailure > circuitBreaker.timeout) {
    resetCircuitBreaker();
  }
}

export function getPushMetrics(): PushMetrics {
  return { ...metrics };
}

export function getCircuitBreakerState(): CircuitBreaker {
  return { ...circuitBreaker };
}

export async function deliverNext(store:PushStore,deliver:Deliver,keyId:string):Promise<boolean>{
 const job=await store.claim();if(!job)return false;
 if(job.key_id!==keyId || !trustedPushEndpoint(job.endpoint)){await store.finish(job.id,job.lease_id,'failed','invalid_subscription');return true;}

 checkCircuitBreaker();
 if (circuitBreaker.isOpen) {
  await store.finish(job.id,job.lease_id,'failed','push_service_unavailable');
  console.warn('push_circuit_breaker_active: Deferring delivery due to circuit breaker');
  return true;
 }

 try{
  metrics.deliveriesAttempted++;
  await deliver({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},JSON.stringify({title:'Ivraine',body:'A little “I miss you” is waiting in your private scrapbook. ♡',eventId:job.event_id,url:'/#story',tag:`ivraine-heart-${job.event_id}`}));
  await store.finish(job.id,job.lease_id,'accepted',null);
  metrics.deliveriesSuccessful++;
 }catch(error){
  const status=typeof error==='object'&&error!==null&&'statusCode' in error?Number(error.statusCode):0;
  if(status===404||status===410){await store.removeExpired(job.subscription_id);return true;}
  const retryable=status===0||status===408||status===429||status>=500;
  if(status===401||status===403)console.error('push_vapid_rejected: verify the VAPID key pair and subject');
  const retry=retryable&&job.attempts<5;
  if(retry)metrics.retriesAttempted++;else metrics.deliveriesFailed++;
  recordFailure();
  await store.finish(job.id,job.lease_id,retry?'pending':'failed',status?`push_http_${status}`:'push_network_error',Math.min(900,15*2**(job.attempts-1)));
 }
 return true;
}

export function startPushWorker(store:PushStore,deliver:Deliver,keyId:string){
 let stopped=false,busy=false,active:Promise<void>=Promise.resolve();
 const tick=()=>{if(stopped||busy)return;busy=true;active=(async()=>{try{for(let i=0;i<10&&!stopped;i++){if(!await deliverNext(store,deliver,keyId))break;}}catch{console.error('push_worker_failed: verify database connectivity and notification migration');}finally{busy=false;}})();};
 const timer=setInterval(tick,5000);timer.unref();tick();
 return async()=>{stopped=true;clearInterval(timer);await active;};
}
