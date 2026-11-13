import { MotionConfig } from 'framer-motion'
import { Component, type ReactNode, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppFrame, ProjectLayout } from './components/Shell'
import { projectById } from './lib/projects.config'
import { startFeed, useStore } from './lib/store'
import Embed from './pages/Embed'
import EnergyPage from './pages/energy/EnergyPage'
import InverterPage from './pages/inverter/InverterPage'
import Landing from './pages/Landing'
import MapPage from './pages/map/MapPage'
import AboutPage from './pages/lab/AboutPage'
import PeoplePage from './pages/lab/PeoplePage'

import ThermalPage from './pages/thermal/ThermalPage'

/** Keeps one failing view from blanking the whole site; resets when the route changes. */
class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h2 className="font-serif text-[20px] font-semibold">This view could not be displayed</h2>
        <p className="mt-2 text-[13.5px] text-ink2">{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} className="mt-4 rounded-sm bg-navy px-4 py-2 text-[13px] font-medium text-onnavy">Try again</button>
      </div>
    )
  }
}

export function Routed() {
  const loc = useLocation()
  return (
    <Boundary resetKey={loc.pathname}>
      <Routes>
        <Route path="/embed/:project" element={<Embed />} />
        <Route path="/" element={<AppFrame><Landing /></AppFrame>} />
        <Route path="/thermal/:section?" element={<AppFrame><ProjectLayout project={projectById('thermal')!} render={(s) => <ThermalPage section={s} />} /></AppFrame>} />
        <Route path="/energy/:section?" element={<AppFrame><ProjectLayout project={projectById('energy')!} render={(s) => <EnergyPage section={s} />} /></AppFrame>} />
        <Route path="/map" element={<AppFrame><MapPage /></AppFrame>} />
        <Route path="/inverter/:section?" element={<AppFrame><ProjectLayout project={projectById('inverter')!} render={(s) => <InverterPage section={s} />} /></AppFrame>} />
        <Route path="/about" element={<AppFrame><AboutPage /></AppFrame>} />
        <Route path="/people" element={<AppFrame><PeoplePage /></AppFrame>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Boundary>
  )
}

export default function App() {
  const reduced = useStore((s) => s.reducedMotion)
  useEffect(() => startFeed(), [])
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
      <HashRouter>
        <Routed />
      </HashRouter>
    </MotionConfig>
  )
}
