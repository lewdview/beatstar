import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import Home from "@/pages/Home";
import SongSelect from "@/pages/SongSelect";
import Campaign from "@/pages/Campaign";
import Chapter from "@/pages/Chapter";
import SongDetail from "@/pages/SongDetail";
import Game from "@/pages/Game";
import Results from "@/pages/Results";
import Tutorial from "@/pages/Tutorial";
import Options from "@/pages/Options";
import BackgroundMusic from "@/components/audio/BackgroundMusic";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/campaign" component={Campaign} />
      <Route path="/chapter/:month" component={Chapter} />
      <Route path="/songs" component={SongSelect} />
      <Route path="/song/:songId" component={SongDetail} />
      <Route path="/play/:songId" component={Game} />
      <Route path="/results/:songId" component={Results} />
      <Route path="/tutorial" component={Tutorial} />
      <Route path="/options" component={Options} />
      <Route>
        <div className="min-h-screen flex items-center justify-center text-muted-foreground font-mono text-sm">
          404 — SIGNAL LOST
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="scanlines" />
      <div className="vignette" />
      <div className="noise-overlay" />
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <BackgroundMusic />
        <Router />
      </WouterRouter>
      <Analytics />
    </QueryClientProvider>
  );
}

export default App;
