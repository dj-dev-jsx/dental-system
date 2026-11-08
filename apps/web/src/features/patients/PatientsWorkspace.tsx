import { Outlet, useLocation } from 'react-router'
import { SplitView } from '../../components/SplitView'
import { PatientList } from './PatientList'

/**
 * Patients as a workspace: the list on the left, the open record (or the registration form)
 * on the right. The list stays mounted while records change beside it, so its scroll,
 * search and loaded pages survive. On phones one side shows at a time.
 */
export default function PatientsWorkspace() {
  const { pathname } = useLocation()
  // /app/patients/:id, /app/patients/:id/edit and /app/patients/new open the right side.
  const child = /^\/app\/patients\/([^/]+)/.exec(pathname)?.[1] ?? null
  const showingDetail = child !== null
  const selectedId = child && child !== 'new' ? decodeURIComponent(child) : null

  return (
    <SplitView
      listLabel="Patients"
      showingDetail={showingDetail}
      list={<PatientList selectedId={selectedId} hidden={showingDetail} />}
      detail={<Outlet />}
    />
  )
}
