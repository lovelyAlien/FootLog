import { clusterByProximity, haversineDistanceMeters } from '../../shared/geo';
import type { CheckIn } from '../check-in/domain';

const AREA_CLUSTER_THRESHOLD_METERS = 200;

export type DailySummary = {
  checkInCount: number;
  firstCheckedInAt: string | null;
  lastCheckedInAt: string | null;
  approximateDistanceMeters: number;
  longestConsecutiveArea: {
    startedAt: string;
    endedAt: string;
    checkInIds: string[];
  } | null;
};

function byCheckedInAtAscending(a: CheckIn, b: CheckIn): number {
  return Date.parse(a.checkedInAt) - Date.parse(b.checkedInAt);
}

function durationMs(area: { startedAt: string; endedAt: string }): number {
  return Date.parse(area.endedAt) - Date.parse(area.startedAt);
}

export function computeDailySummary(checkIns: CheckIn[]): DailySummary {
  if (checkIns.length === 0) {
    return {
      checkInCount: 0,
      firstCheckedInAt: null,
      lastCheckedInAt: null,
      approximateDistanceMeters: 0,
      longestConsecutiveArea: null,
    };
  }

  const sorted = [...checkIns].sort(byCheckedInAtAscending);

  let approximateDistanceMeters = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    approximateDistanceMeters += haversineDistanceMeters(sorted[i - 1], sorted[i]);
  }

  const clusterableCheckIns = sorted.filter((checkIn) => checkIn.accuracyM <= AREA_CLUSTER_THRESHOLD_METERS);
  const clusters = clusterByProximity(clusterableCheckIns, AREA_CLUSTER_THRESHOLD_METERS);

  const longestConsecutiveArea = clusters.reduce<DailySummary['longestConsecutiveArea']>((longest, cluster) => {
    const candidate = {
      startedAt: cluster[0].checkedInAt,
      endedAt: cluster[cluster.length - 1].checkedInAt,
      checkInIds: cluster.map((checkIn) => checkIn.id),
    };

    return !longest || durationMs(candidate) > durationMs(longest) ? candidate : longest;
  }, null);

  return {
    checkInCount: sorted.length,
    firstCheckedInAt: sorted[0].checkedInAt,
    lastCheckedInAt: sorted[sorted.length - 1].checkedInAt,
    approximateDistanceMeters,
    longestConsecutiveArea,
  };
}
