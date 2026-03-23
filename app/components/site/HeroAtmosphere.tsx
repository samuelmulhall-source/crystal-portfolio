"use client";

import { useDisplayMode } from "./DisplayModeProvider";

export function HeroAtmosphere() {
  const { effectiveMode } = useDisplayMode();

  return (
    <div className={`hero-atmosphere hero-atmosphere--${effectiveMode}`} aria-hidden="true">
      <div className="hero-atmosphere__field" />
      <div className="hero-atmosphere__aurora hero-atmosphere__aurora--left" />
      <div className="hero-atmosphere__aurora hero-atmosphere__aurora--right" />
      <div className="hero-atmosphere__ring hero-atmosphere__ring--left" />
      <div className="hero-atmosphere__ring hero-atmosphere__ring--right" />
      <div className="hero-atmosphere__mist hero-atmosphere__mist--near" />
      <div className="hero-atmosphere__mist hero-atmosphere__mist--far" />
    </div>
  );
}
