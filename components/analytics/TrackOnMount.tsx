"use client";

import {
  track,
  type AnalyticsEvent,
  type AnalyticsProps,
} from "@/lib/analytics";
import { useEffect, useRef } from "react";

type TrackOnMountProps = {
  event: AnalyticsEvent;
  props?: AnalyticsProps;
};

/**
 * Fires a single analytics event when the component mounts (once per event+book id).
 */
export function TrackOnMount({ event, props }: TrackOnMountProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event, props);
    // Intentionally only on mount for page-view style events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return null;
}
