import { inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { enrollments, purchases } from "~/db/schema";

// ─── Analytics Service ───
// Instructor-facing metrics over a set of courses. Every metric is a single SQL
// aggregate over the given course IDs — never a query per student.
// Uses positional parameters (project convention).

/** A resolved, inclusive time range as ISO timestamps; null means open-ended. */
export type AnalyticsRange = { start: string | null; end: string | null };

export const ALL_TIME: AnalyticsRange = { start: null, end: null };

export type AnalyticsSummary = {
  studentCount: number;
  /** Gross revenue in cents: sum of PPP-adjusted amountPaid, team purchases in full. */
  revenueCents: number;
  saleCount: number;
};

export function getAnalyticsSummary(
  courseIds: number[],
  // Accepted now so callers are stable; range filtering lands in a later ticket.
  _range: AnalyticsRange
): AnalyticsSummary {
  if (courseIds.length === 0) {
    return { studentCount: 0, revenueCents: 0, saleCount: 0 };
  }

  const students = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(inArray(enrollments.courseId, courseIds))
    .get();

  const sales = db
    .select({
      total: sql<number>`coalesce(sum(${purchases.amountPaid}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(purchases)
    .where(inArray(purchases.courseId, courseIds))
    .get();

  return {
    studentCount: students?.count ?? 0,
    revenueCents: sales?.total ?? 0,
    saleCount: sales?.count ?? 0,
  };
}
