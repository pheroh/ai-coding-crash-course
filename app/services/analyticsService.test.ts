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

import { getAnalyticsSummary, ALL_TIME } from "./analyticsService";

function addStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number) {
  testDb.insert(schema.enrollments).values({ userId, courseId }).run();
}

function purchase(userId: number, courseId: number, amountPaid: number) {
  return testDb
    .insert(schema.purchases)
    .values({ userId, courseId, amountPaid, country: null })
    .returning()
    .get();
}

describe("analyticsService.getAnalyticsSummary", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("students", () => {
    it("counts paid, coupon-redeemed and free enrollments alike", () => {
      const paidStudent = base.user;
      const couponStudent = addStudent("coupon@example.com");
      const freeStudent = addStudent("free@example.com");

      // Paid: purchase + enrollment.
      purchase(paidStudent.id, base.course.id, 4999);
      enroll(paidStudent.id, base.course.id);

      // Coupon: a team buyer's purchase generated a coupon the student redeemed.
      const teamPurchase = purchase(base.instructor.id, base.course.id, 9998);
      const team = testDb.insert(schema.teams).values({}).returning().get();
      testDb
        .insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: base.course.id,
          code: "TEAM-1",
          purchaseId: teamPurchase.id,
          redeemedByUserId: couponStudent.id,
          redeemedAt: new Date().toISOString(),
        })
        .run();
      enroll(couponStudent.id, base.course.id);

      // Free: enrollment with no purchase.
      enroll(freeStudent.id, base.course.id);

      expect(getAnalyticsSummary([base.course.id], ALL_TIME).studentCount).toBe(3);
    });

    it("is zero when the course has no enrollments", () => {
      expect(getAnalyticsSummary([base.course.id], ALL_TIME).studentCount).toBe(0);
    });
  });

  describe("revenue", () => {
    it("sums what was actually paid, including PPP-discounted purchases", () => {
      const other = addStudent("india@example.com");
      purchase(base.user.id, base.course.id, 4999); // full price
      purchase(other.id, base.course.id, 2500); // PPP-adjusted

      const summary = getAnalyticsSummary([base.course.id], ALL_TIME);
      expect(summary.revenueCents).toBe(7499);
      expect(summary.saleCount).toBe(2);
    });

    it("counts a team purchase at its full amount regardless of seats redeemed", () => {
      // 5 seats bought, none redeemed yet.
      purchase(base.user.id, base.course.id, 24995);

      expect(getAnalyticsSummary([base.course.id], ALL_TIME).revenueCents).toBe(24995);
    });

    it("is zero when the course has no purchases", () => {
      const summary = getAnalyticsSummary([base.course.id], ALL_TIME);
      expect(summary.revenueCents).toBe(0);
      expect(summary.saleCount).toBe(0);
    });
  });

  describe("course scope", () => {
    function addCourse(slug: string) {
      return testDb
        .insert(schema.courses)
        .values({
          title: slug,
          slug,
          description: slug,
          salesCopy: slug,
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();
    }

    it("only includes the given courses", () => {
      const other = addCourse("other-course");
      enroll(base.user.id, other.id);
      purchase(base.user.id, other.id, 1000);

      const summary = getAnalyticsSummary([base.course.id], ALL_TIME);
      expect(summary.studentCount).toBe(0);
      expect(summary.revenueCents).toBe(0);
    });

    it("sums students and revenue across several courses", () => {
      const second = addCourse("second-course");
      const otherStudent = addStudent("second@example.com");
      enroll(base.user.id, base.course.id);
      enroll(base.user.id, second.id);
      enroll(otherStudent.id, second.id);
      purchase(base.user.id, base.course.id, 1000);
      purchase(otherStudent.id, second.id, 2000);

      const summary = getAnalyticsSummary([base.course.id, second.id], ALL_TIME);
      expect(summary.studentCount).toBe(3);
      expect(summary.revenueCents).toBe(3000);
    });

    it("returns zeros for an empty course list", () => {
      expect(getAnalyticsSummary([], ALL_TIME)).toEqual({
        studentCount: 0,
        revenueCents: 0,
        saleCount: 0,
      });
    });
  });
});
