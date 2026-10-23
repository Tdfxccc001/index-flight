/** Visual feedback only; these values never change scoring or flight physics. */
export const HUD = {
  comboTiers: [
    { min: 1, color: '#bfd0da' },
    { min: 1.25, color: '#82e7c5' },
    { min: 2, color: '#83cfff' },
    { min: 3, color: '#c2a2ff' },
    { min: 4, color: '#ffcf77' },
  ],
  energyLow: 45,
  energyCritical: 20,
  recoveryNotice: 25,
  pulseDuration: 480,
  highPulseDuration: 650,
  sparksDuration: 700,
} as const;
