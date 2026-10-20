import { render } from 'preact';
import { phoneLanguage, stringsFor } from '../ui/strings.ts';
import { Admin } from './Admin.tsx';
import '../ui/fonts.css';
import '../ui/styles.css';
import './admin.css';

const root = document.getElementById('admin');
if (!root) throw new Error('Poutine: the #admin element is missing from admin/index.html.');

const language = phoneLanguage(navigator.languages);
const strings = stringsFor(language);
document.documentElement.lang = language;
document.title = `${strings.appName} · ${strings.admin.title}`;

render(<Admin strings={strings} />, root);
