import { useState } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { Button, Card, Empty, Popconfirm } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import {
  createProject,
  deleteProject,
  getProjects,
} from '#/server/projects.functions'

export const Route = createFileRoute('/')({
  loader: () => getProjects(),
  component: Home,
})

function Home() {
  const projects = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  const create = async () => {
    setCreating(true)
    try {
      const project = await createProject({ data: {} })
      await navigate({
        to: '/projects/$projectId',
        params: { projectId: project.id },
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold">Bulletin 1000 Generator</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={creating}
          onClick={() => void create()}
        >
          New project
        </Button>
      </div>
      <Card size="small">
        {projects.length === 0 ? (
          <Empty description="No projects yet" />
        ) : (
          <ul className="m-0 list-none divide-y divide-neutral-200 p-0">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-2 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="font-medium"
                  >
                    {p.title}
                  </Link>
                  <div className="text-xs text-neutral-500">
                    Edited {p.updatedAt.toLocaleString()}
                  </div>
                </div>
                <Popconfirm
                  title="Delete this project?"
                  description="Its uploaded files are deleted too."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    await deleteProject({ data: { id: p.id } })
                    await router.invalidate()
                  }}
                >
                  <Button
                    type="text"
                    aria-label="Delete"
                    icon={<DeleteOutlined />}
                  />
                </Popconfirm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  )
}
