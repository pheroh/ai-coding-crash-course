import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings, courses, users, UserRole } from "~/db/schema";
import { isUserEnrolled } from "~/services/enrollmentService";

// ─── Rating Service ───
// Students rate courses on a 0–5 star scale. One rating per student per
// course; rating again replaces the previous value. Individual ratings are
// stored but only the aggregate (average + count) is exposed publicly.
// Uses positional parameters (project convention).

export const MIN_RATING = 0;
export const MAX_RATING = 5;

export type RatingSummary = {
  average: number | null;
  count: number;
};

export function getCourseRatingSummary(courseId: number): RatingSummary {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  const count = result?.count ?? 0;
  return {
    average: count > 0 && result?.average != null ? result.average : null,
    count,
  };
}

/**
 * Bulk version of getCourseRatingSummary for list views (one query instead of
 * one per course). Every requested id is present in the result; unrated
 * courses get { average: null, count: 0 }.
 */
export function getRatingSummariesForCourses(
  courseIds: number[]
): Map<number, RatingSummary> {
  const summaries = new Map<number, RatingSummary>(
    courseIds.map((id) => [id, { average: null, count: 0 }])
  );
  if (courseIds.length === 0) {
    return summaries;
  }

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    summaries.set(row.courseId, { average: row.average, count: row.count });
  }
  return summaries;
}

export function getUserRatingForCourse(
  userId: number,
  courseId: number
): number | null {
  const row = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();

  return row?.rating ?? null;
}

/**
 * Returns null if the user may rate the course, or a reason string if not.
 * Only students enrolled in the course can rate it. Instructors (and admins)
 * cannot rate any course.
 */
export function getRatingIneligibilityReason(
  userId: number,
  courseId: number
): string | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return "User not found";
  }
  if (user.role !== UserRole.Student) {
    return "Only students can rate courses";
  }

  const course = db
    .select({ id: courses.id, instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    return "Course not found";
  }
  if (course.instructorId === userId) {
    return "You cannot rate your own course";
  }

  if (!isUserEnrolled(userId, courseId)) {
    return "You must be enrolled in this course to rate it";
  }

  return null;
}

export function canUserRateCourse(userId: number, courseId: number) {
  return getRatingIneligibilityReason(userId, courseId) === null;
}

export function rateCourse(userId: number, courseId: number, rating: number) {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw new Error(
      `Rating must be a whole number between ${MIN_RATING} and ${MAX_RATING}`
    );
  }

  const reason = getRatingIneligibilityReason(userId, courseId);
  if (reason) {
    throw new Error(reason);
  }

  const now = new Date().toISOString();
  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating, updatedAt: now },
    })
    .returning()
    .get();
}
