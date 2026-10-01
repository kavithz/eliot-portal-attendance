import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { createMonthlyAttendancePdf } from "@/lib/attendance/monthly-pdf";
import { getEmployeeMonthlyReport } from "@/lib/attendance/reports";
import { requirePageUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const user = await requirePageUser();
  const month = request.nextUrl.searchParams.get("month") ?? formatInTimeZone(new Date(), user.timeZone, "yyyy-MM");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new NextResponse("Invalid report month.", { status: 400 });
  const report = await getEmployeeMonthlyReport(user.id, month, user);
  const pdf = await createMonthlyAttendancePdf({
    month,
    title: "Employee attendance",
    employees: [{ name: user.name, email: user.email, timeZone: user.timeZone, report }],
    summary: {
      totalSessions: report.summary.totalSessions,
      totalWorkedMs: report.summary.totalWorkedMs,
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="attendance-report-${month}.pdf"`,
    },
  });
}
