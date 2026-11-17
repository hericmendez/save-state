import LoadingScreen from "@/components/RPGUI/LoadingScreen";

export default function DashboardLoading() {
  return (
    <main className="flex flex-col gap-4">
      <div className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-[1.3rem]">Estatísticas</h1>
      </div>
      <LoadingScreen message="Carregando estatísticas..." />
    </main>
  );
}
