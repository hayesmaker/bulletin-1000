import { createFileRoute } from '@tanstack/react-router'
import { Layout, Menu, theme } from 'antd';

const { Header, Content, Footer } = Layout;
export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="p-8">
        <Layout>
            <Header>
                <h1>This is the header</h1>
            </Header>
            <Content>
                <p>
                    This is the page content
                </p>
            </Content>
            <Footer>
                This is the Footer
            </Footer>
        </Layout>

    </div>
  )
}
