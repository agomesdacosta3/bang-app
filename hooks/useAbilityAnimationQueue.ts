import { useCallback, useRef, useState } from 'react';
import { AbilityAnimationRequest, AbilityAnimationType } from '../components/AbilityAnimationOverlay';

let counter = 0;

export function useAbilityAnimationQueue() {
  const [current, setCurrent] = useState<AbilityAnimationRequest | null>(null);
  const queueRef = useRef<AbilityAnimationRequest[]>([]);

  const advance = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setCurrent(next);
  }, []);

  const enqueue = useCallback((type: AbilityAnimationType, actorName: string, targetName?: string) => {
    counter += 1;
    const req: AbilityAnimationRequest = { id: `abty_${counter}`, type, actorName, targetName };
    queueRef.current.push(req);
    setCurrent((cur) => (cur ? cur : (queueRef.current.shift() ?? null)));
  }, []);

  return { current, enqueue, onDone: advance };
}