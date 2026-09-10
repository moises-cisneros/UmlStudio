import { useEffect, useState } from "react";

const subscribers = new Set<() => void>();
let intervalId: number | null = null;

const startTicking = () => {
  if (intervalId !== null) {
    return;
  }
  intervalId = window.setInterval(() => {
    for (const notify of subscribers) {
      notify();
    }
  }, 60_000);
};

const stopTicking = () => {
  if (intervalId !== null && subscribers.size === 0) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
};

export const useMinuteTick = (): number => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const notify = () => setTick((current) => current + 1);
    subscribers.add(notify);
    startTicking();

    return () => {
      subscribers.delete(notify);
      stopTicking();
    };
  }, []);

  return tick;
};
