"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { connect, disconnect, refresh, retryLoad, retrySaves, useIronlog } from "@/lib/store";

/** Ties the data store to whoever Clerk says is signed in, and says plainly when the
 *  account can't be reached. Renders nothing while all is well. */
export function AccountData() {
  const { isLoaded, userId, getToken } = useAuth();
  const tokenRef = useRef(getToken);
  useEffect(() => {
    tokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    if (userId) connect(userId, () => tokenRef.current());
    else disconnect();
  }, [isLoaded, userId]);

  // coming back to the tab picks up what was done in another tab or on another device
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const snap = useIronlog();
  if (!userId) return null;
  if (snap.loadFailed) {
    return (
      <div className="mb-6">
        <Banner tone="warning" title="Couldn't load your training" action={<Button onClick={retryLoad}>Try again</Button>}>
          Your account didn&apos;t answer. Check your connection, then try again.
        </Banner>
      </div>
    );
  }
  if (snap.saveFailed) {
    return (
      <div className="mb-6">
        <Banner tone="warning" title="Your last change isn't saved yet" action={<Button onClick={retrySaves}>Try again</Button>}>
          It&apos;s kept on this screen. Check your connection, then try again — closing this tab now would lose it.
        </Banner>
      </div>
    );
  }
  return null;
}
