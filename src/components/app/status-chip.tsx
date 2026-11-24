import { CircleCheck, ClockArrowUp } from "lucide-react";

export function StatusChip({ menungguSinkron }: { menungguSinkron: boolean }) {
  return menungguSinkron ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-menunggu px-2 py-1 text-xs font-semibold text-menunggu-fg">
      <ClockArrowUp className="size-3.5" aria-hidden /> Menunggu Sinkron
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-sukses px-2 py-1 text-xs font-semibold text-sukses-fg">
      <CircleCheck className="size-3.5" aria-hidden /> Tersimpan
    </span>
  );
}
