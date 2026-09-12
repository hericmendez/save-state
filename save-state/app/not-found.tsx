import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="rpgui-container framed-golden p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/toriel.png" alt="" aria-hidden="true" className="mx-auto" />
        <h1 className="font-display text-2xl">Página não encontrada</h1>
        <p className="mt-2">A página que você procura não existe.</p>
        <Link className="rpgui-button mt-4 inline-block" href="/dashboard">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
