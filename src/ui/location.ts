/** Why the phone gave no position. */
export type NoFix = 'denied' | 'unavailable';

/** The phone's position, asked once (Near me, I'm here); rejects with a NoFix. */
export function whereAmI(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unavailable' satisfies NoFix));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      (error) => {
        reject(
          new Error(
            (error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable') satisfies NoFix,
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

export function noFixOf(error: unknown): NoFix {
  return error instanceof Error && error.message === 'denied' ? 'denied' : 'unavailable';
}
