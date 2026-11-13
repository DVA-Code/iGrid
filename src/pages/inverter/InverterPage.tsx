import DesignFlow from './DesignFlow'
import DesignLab from './DesignLab'

export default function InverterPage({ section }: { section: string }) {
  switch (section) {
    case 'lab': return <DesignLab />
    default: return <DesignFlow />
  }
}
