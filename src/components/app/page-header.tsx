export function PageHeader({
  judul,
  keterangan,
  children,
}: {
  judul: string;
  keterangan?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="bg-forest px-5 pb-6 pt-[18px] text-paper">
      <p className="text-[13px] opacity-85">lifelibrary</p>
      <h1 className="mt-3 text-[34px] font-bold leading-[1.1]">{judul}</h1>
      {keterangan && <p className="mt-1.5 text-sm opacity-80">{keterangan}</p>}
      {children}
    </header>
  );
}
