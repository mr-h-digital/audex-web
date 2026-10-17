export function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="page-heading">
      <h1 className="pagetitle">{title}</h1>
      <p className="small">{description}</p>
    </header>
  );
}
