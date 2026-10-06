"use client";

import { PinReadout } from "@/components/charts/PinReadout";
import { useTradeActions, useTradeValues } from "./TradeState";

/** The trade page's phone readout: `PinReadout` wired to `TradeState`. */
export function MobileReadout({ line }: { line: string }) {
  const { pin } = useTradeValues();
  const { clearPin } = useTradeActions();
  return <PinReadout line={line} pinned={pin !== null} onClear={clearPin} />;
}
