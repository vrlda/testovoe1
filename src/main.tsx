import { createRoot } from 'react-dom/client';
import { Funnel } from './Funnel';
import { Admin } from './admin/Admin';
import { Shell } from './components';
import './style.css';

const page =
  location.pathname === '/' ? (
    <Funnel />
  ) : location.pathname.replace(/\/$/, '') === '/admin' ? (
    <Admin />
  ) : (
    <Shell>
      <main id="main" className="page narrow">
        <h1>Страница не найдена</h1>
        <a className="button" href="/">
          Открыть воронку
        </a>
      </main>
    </Shell>
  );
createRoot(document.getElementById('root')!).render(page);
