export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layout limpo para páginas de autenticação (sem sidebar)
  return <>{children}</>;
}
