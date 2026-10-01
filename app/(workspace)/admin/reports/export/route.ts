import { NextRequest, NextResponse } from "next/server";
import { createMonthlyAttendancePdf } from "@/lib/attendance/monthly-pdf";
import { getAdminMonthlyReport } from "@/lib/attendance/reports";
import { requirePageAdmin } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  await requirePageAdmin();
  const month = request.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new NextResponse("Invalid report month.", { status: 400 });
  const { employees, summary } = await getAdminMonthlyReport(month);
  const pdf = await createMonthlyAttendancePdf({
    month,
    title: "Company attendance",
    employees: employees.map(({ employee, report }) => ({ ...employee, report })),
    summary,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="attendance-summary-${month}.pdf"`,
    },
  });
}
