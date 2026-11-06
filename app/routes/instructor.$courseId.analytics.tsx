import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.$courseId.analytics";
import { getCourseById } from "~/services/courseService";
import { getAnalyticsSummary, ALL_TIME } from "~/services/analyticsService";
import { requireInstructorOrAdmin, requireStaff } from "~/lib/access.server";
import { formatRevenue } from "~/lib/utils";
import { StatCard } from "~/components/stat-card";
import { Button } from "~/components/ui/button";
import { AlertTriangle, ArrowLeft, DollarSign, Users } from "lucide-react";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Course Analytics";
  return [
    { title: `Analytics: ${title} — Cadence` },
    { name: "description", content: `Analytics for ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireInstructorOrAdmin(request);

  const courseId = parseInt(params.courseId, 10);
  if (isNaN(courseId)) {
    throw data("Invalid course ID.", { status: 400 });
  }

  const course = getCourseById(courseId);
  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  // Owning instructor or admin. Checked after the lookup so an unknown course is a 404.
  await requireStaff(request, courseId);

  const summary = getAnalyticsSummary([courseId], ALL_TIME);

  return {
    course: { id: course.id, title: course.title },
    summary,
  };
}

export default function CourseAnalytics({ loaderData }: Route.ComponentProps) {
  const { course, summary } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <Link to={`/instructor/${course.id}`} className="hover:text-foreground">
          {course.title}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <Link
        to={`/instructor/${course.id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" />
        Back to course editor
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="mt-1 text-muted-foreground">{course.title} · All time</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Students"
          value={summary.studentCount.toLocaleString("en-US")}
          subtitle="enrolled, paid or free"
          icon={Users}
        />
        <StatCard
          label="Revenue"
          value={formatRevenue(summary.revenueCents)}
          subtitle={`from ${summary.saleCount} ${summary.saleCount === 1 ? "sale" : "sales"}`}
          icon={DollarSign}
        />
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading course analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Course not found";
      message = "The course you're looking for doesn't exist or may have been removed.";
    } else if (error.status === 401) {
      title = "Sign in required";
      message = typeof error.data === "string" ? error.data : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message = typeof error.data === "string" ? error.data : "You don't have permission to view these analytics.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/instructor">
            <Button variant="outline">My Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
