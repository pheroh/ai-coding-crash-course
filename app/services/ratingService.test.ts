import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  rateCourse,
  getCourseRatingSummary,
  getUserRatingForCourse,
  getRatingSummariesForCourses,
  canUserRateCourse,
} from "./ratingService";

function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number) {
  testDb.insert(schema.enrollments).values({ userId, courseId }).run();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("rateCourse", () => {
    it("lets an enrolled student rate a course", () => {
      enroll(base.user.id, base.course.id);

      const rating = rateCourse(base.user.id, base.course.id, 4);

      expect(rating.rating).toBe(4);
      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBe(4);
    });

    it("accepts 0 and 5 as boundary values", () => {
      enroll(base.user.id, base.course.id);

      expect(rateCourse(base.user.id, base.course.id, 0).rating).toBe(0);
      expect(rateCourse(base.user.id, base.course.id, 5).rating).toBe(5);
    });

    it("updates the existing rating instead of adding a second one", () => {
      enroll(base.user.id, base.course.id);

      rateCourse(base.user.id, base.course.id, 2);
      rateCourse(base.user.id, base.course.id, 5);

      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBe(5);
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 5,
        count: 1,
      });
    });

    it.each([-1, 6, 3.5, NaN])("rejects invalid rating %s", (value) => {
      enroll(base.user.id, base.course.id);

      expect(() => rateCourse(base.user.id, base.course.id, value)).toThrow(
        "Rating must be a whole number between 0 and 5"
      );
    });

    it("rejects students who are not enrolled", () => {
      expect(() => rateCourse(base.user.id, base.course.id, 3)).toThrow(
        "You must be enrolled in this course to rate it"
      );
    });

    it("rejects the course's own instructor", () => {
      expect(() => rateCourse(base.instructor.id, base.course.id, 5)).toThrow(
        "Only students can rate courses"
      );
    });

    it("rejects an instructor rating another instructor's course, even if enrolled", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      enroll(otherInstructor.id, base.course.id);

      expect(() => rateCourse(otherInstructor.id, base.course.id, 5)).toThrow(
        "Only students can rate courses"
      );
      expect(canUserRateCourse(otherInstructor.id, base.course.id)).toBe(false);
    });

    it("rejects a non-existent course", () => {
      expect(() => rateCourse(base.user.id, 9999, 3)).toThrow(
        "Course not found"
      );
    });
  });

  describe("getCourseRatingSummary", () => {
    it("returns null average and zero count when unrated", () => {
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("averages ratings across students", () => {
      const a = createStudent("a@example.com");
      const b = createStudent("b@example.com");
      const c = createStudent("c@example.com");
      for (const s of [a, b, c]) enroll(s.id, base.course.id);

      rateCourse(a.id, base.course.id, 5);
      rateCourse(b.id, base.course.id, 4);
      rateCourse(c.id, base.course.id, 0);

      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 3,
        count: 3,
      });
    });
  });

  describe("getRatingSummariesForCourses", () => {
    it("returns a summary for every requested course, including unrated ones", () => {
      const other = testDb
        .insert(schema.courses)
        .values({
          title: "Other",
          slug: "other",
          description: "Other course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();
      const a = createStudent("a@example.com");
      enroll(a.id, base.course.id);
      enroll(base.user.id, base.course.id);
      rateCourse(a.id, base.course.id, 5);
      rateCourse(base.user.id, base.course.id, 2);

      const summaries = getRatingSummariesForCourses([base.course.id, other.id]);

      expect(summaries.get(base.course.id)).toEqual({ average: 3.5, count: 2 });
      expect(summaries.get(other.id)).toEqual({ average: null, count: 0 });
    });

    it("returns an empty map for no ids", () => {
      expect(getRatingSummariesForCourses([]).size).toBe(0);
    });
  });

  describe("getUserRatingForCourse", () => {
    it("returns null when the user has not rated", () => {
      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBeNull();
    });
  });
});
