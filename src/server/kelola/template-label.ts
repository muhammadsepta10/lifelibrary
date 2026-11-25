import { templateLabelSchema, type TemplateLabel } from "@/lib/label/template-label";
import type { KelolaTransport } from "@/lib/kelola-protocol";
import { templateLabel } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { parse, sekarangServer } from "./galat";

export const ID_TEMPLATE_LABEL = "utama";

type Row = typeof templateLabel.$inferSelect;

export const templateDariRow = (r: Row): TemplateLabel => ({
  kertas: r.kertas as TemplateLabel["kertas"],
  w: r.w,
  h: r.h,
  mt: r.mt,
  ml: r.ml,
  gx: r.gx,
  gy: r.gy,
});

export function templateLabelApi(db: Db): KelolaTransport["templateLabel"] {
  return {
    async simpan(input) {
      const data = parse(templateLabelSchema, input);
      const [r] = await db
        .insert(templateLabel)
        .values({ id: ID_TEMPLATE_LABEL, ...data })
        .onConflictDoUpdate({ target: templateLabel.id, set: { ...data, updatedAt: sekarangServer } })
        .returning();
      return templateDariRow(r);
    },
  };
}
