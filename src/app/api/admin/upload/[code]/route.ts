import { NextResponse } from "next/server";
import { deleteUploadByCode } from "../../../../../lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: { code: string } }
) {
  const adminId = Number(
    process.env.ADMIN_USER_ID ?? process.env.TELEGRAM_ADMIN_ID ?? "0"
  );
  if (!adminId) {
    return NextResponse.json({ error: "Admin ID not configured" }, { status: 500 });
  }

  try {
    const deleted = await deleteUploadByCode(adminId, params.code);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
