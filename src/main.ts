import todoCss from './main.css';
import plugin from '../plugin.json';
import todoIconSvg from '../icon.svg';
import type { WCPage } from 'acode/editor/page';

const select = acode.require('select');
const prompt = acode.require('prompt');
const alertBox = acode.require('alert');
const confirmBox = acode.require('confirm');
const fileBrowser = acode.require('fileBrowser');
const sideBarApps = acode.require('sidebarApps');
const selectionMenu = acode.require('selectionMenu');

interface Project {
  name: string;
  todos: Todo[];
}

interface Todo {
  text: string;
  file: string;
  line: number;
}

interface ProjectsData {
  projects: Project[];
}

class AcodePlugin {
  private currentProjectIndex = 0;
  public baseUrl: string | undefined;
  private sidebarContainer: HTMLElement | null = null;
  private projects: ProjectsData = this.loadStoredProjects();

  private loadStoredProjects(): ProjectsData {
    try {
      const stored = localStorage.getItem(plugin.id);
      if (!stored) return { projects: [] };

      const data = JSON.parse(stored) as Partial<ProjectsData>;

      if (!Array.isArray(data.projects)) {
        return { projects: [] };
      }

      return {
        projects: data.projects.map((project) => ({
          name: project.name ?? '',
          todos: Array.isArray(project.todos)
            ? project.todos.map((todo) => ({
                text: todo.text ?? '',
                file: todo.file ?? '',
                line: todo.line ?? 0
              }))
            : []
        }))
      };
    } catch {
      return { projects: [] };
    }
  }

  private saveProjects() {
    localStorage.setItem(plugin.id, JSON.stringify(this.projects));
  }

  private async confirmAction(message: string) {
    return await confirmBox(plugin.name, message);
  }

  private showAlert(message: string) {
    alertBox(plugin.name, message);
  }

  private openFile(filePath: string, line: number) {
    fileBrowser.openFile({
      url: filePath,
      name: filePath.split('/').pop() || filePath,
      mode: 'single'
    });
    editorManager.editor.gotoLine(line);
  }

  private async addProject(name: string) {
    this.projects.projects.push({ name, todos: [] });
    this.currentProjectIndex = this.projects.projects.length - 1;
    this.saveProjects();
    this.renderSidebar();
  }

  private async deleteProject(index: number) {
    if (
      !(await this.confirmAction(
        `Are you sure you want to delete the project "${this.projects.projects[index].name}"?`
      ))
    )
      return;
    this.projects.projects.splice(index, 1);
    this.currentProjectIndex = Math.min(
      this.currentProjectIndex,
      this.projects.projects.length - 1
    );
    this.saveProjects();
    this.renderSidebar();
  }

  private async deleteTodo(projectIdx: number, todoIdx: number) {
    if (!(await this.confirmAction(`Are you sure you want to delete this TODO?`))) return;
    this.projects.projects[projectIdx].todos.splice(todoIdx, 1);
    this.saveProjects();
    this.renderSidebar();
  }

  private async addTodoToProject(todo: { text: string; file: string; line: number }) {
    if (this.projects.projects.length === 0) {
      this.showAlert('Please create a new project from the sidebar before adding TODOs.');
      return;
    }

    try {
      const items = this.projects.projects.map((p, index) => ({
        value: index.toString(),
        text: p.name
      }));

      const selected = await select('Select Project', items, { rejectOnCancel: true });
      const projectIndex = parseInt(selected, 10);

      this.projects.projects[projectIndex].todos.push(todo);
      this.saveProjects();
      this.renderSidebar();
      this.showAlert(`Added to project "${this.projects.projects[projectIndex].name}".`);
    } catch (err) {
      console.error('Failed to add TODO:', err);
    }
  }

  private createButton(label: string, title: string, onClick: (e: MouseEvent) => void) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = title;
    btn.onclick = onClick;
    return btn;
  }

  private renderProjects() {
    if (!this.sidebarContainer) return;
    const container = this.sidebarContainer;
    container.className = 'todo-sidebar';
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'todo-header';

    const title = document.createElement('h3');
    title.textContent = plugin.name;
    header.appendChild(title);

    const addBtn = this.createButton('+', 'New Project', async () => {
      try {
        const name = await prompt('Enter new project name:', '', 'text', {
          required: true,
          placeholder: 'My Project',
          match: /^[\w\s-]{1,50}$/,
          test: (val) => val.trim().length > 0
        });
        if (name) this.addProject(name.trim());
      } catch {}
    });
    header.appendChild(addBtn);
    container.appendChild(header);

    this.projects.projects.forEach((project, idx) => {
      const row = document.createElement('div');
      row.className = 'todo-project';
      if (idx === this.currentProjectIndex) row.classList.add('selected');

      const name = document.createElement('span');
      name.textContent = project.name;
      name.onclick = () => {
        this.currentProjectIndex = idx;
        this.renderSidebar();
      };

      const delBtn = this.createButton('🗑️', 'Delete Project', (e) => {
        e.stopPropagation();
        this.deleteProject(idx);
      });

      row.appendChild(name);
      row.appendChild(delBtn);
      container.appendChild(row);
    });

    container.appendChild(document.createElement('hr'));
  }

  private renderTodos() {
    if (!this.sidebarContainer) return;
    const container = this.sidebarContainer;
    const todos = this.projects.projects[this.currentProjectIndex]?.todos || [];

    todos.forEach((todo, tIdx) => {
      const row = document.createElement('div');
      row.className = 'todo-todo';

      const text = document.createElement('span');
      text.textContent = todo.text;
      text.onclick = () => this.openFile(todo.file, todo.line);

      const delBtn = this.createButton('🗑️', 'Delete TODO', () =>
        this.deleteTodo(this.currentProjectIndex, tIdx)
      );

      row.appendChild(text);
      row.appendChild(delBtn);
      container.appendChild(row);
    });
  }

  private renderSidebar() {
    this.renderProjects();
    this.renderTodos();
  }

  private registerSelectionMenu() {
    const iconEl = document.createElement('span');
    iconEl.style.display = 'inline-flex';
    iconEl.style.width = '16px';
    iconEl.style.height = '16px';
    iconEl.innerHTML = todoIconSvg;

    selectionMenu.add(
      () => {
        const editor = editorManager.editor;
        const selectedText = editor.getSelectedText();
        if (!selectedText) {
          this.showAlert('Please select some text to create a TODO.');
          return;
        }

        const filePath = editorManager.activeFile?.uri || 'unknown';
        const line = editor.getCursorPosition().row + 1;
        this.addTodoToProject({ text: selectedText, file: filePath, line });
      },
      iconEl,
      'selected',
      false
    );
  }

  async init($page: WCPage, cacheFile: any, cacheFileUrl: string): Promise<void> {
    acode.addIcon('todo-icon', this.baseUrl + 'icon.png');

    const style = document.createElement('style');
    style.textContent = todoCss;
    document.head.appendChild(style);

    if (window.editorManager && editorManager.editor) {
      this.registerSelectionMenu();
    } else {
      document.addEventListener('editorready', () => this.registerSelectionMenu());
    }

    sideBarApps.add(
      'todo-icon',
      plugin.id,
      plugin.name,
      (container: HTMLElement) => {
        this.sidebarContainer = container;
        this.renderSidebar();
      },
      false,
      (container: HTMLElement) => {
        this.sidebarContainer = container;
        this.renderSidebar();
      }
    );
  }

  async destroy() {
    this.sidebarContainer = null;
    sideBarApps.remove(plugin.id);
  }
}

if (window.acode) {
  const acodePlugin = new AcodePlugin();
  acode.setPluginInit(
    plugin.id,
    async (baseUrl: string, $page: WCPage, { cacheFileUrl, cacheFile }: any) => {
      if (!baseUrl.endsWith('/')) baseUrl += '/';
      acodePlugin.baseUrl = baseUrl;
      await acodePlugin.init($page, cacheFile, cacheFileUrl);
    }
  );

  acode.setPluginUnmount(plugin.id, () => {
    acodePlugin.destroy();
  });
}
