(function() {
  'use strict';

  // --------- Data Layer ---------
  const STORAGE_KEY = 'pm.state.v1';
  const STATUSES = ['backlog', 'inprogress', 'review', 'done'];

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { projects: [], tasks: [] };
      const parsed = JSON.parse(raw);
      if (!parsed.projects || !parsed.tasks) throw new Error('Invalid state');
      return parsed;
    } catch (e) {
      console.warn('Failed to load state, starting fresh', e);
      return { projects: [], tasks: [] };
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function generateId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // --------- State & DOM refs ---------
  let state = loadState();
  let currentProjectId = null;
  let statusChart = null;

  const els = {
    projectSelect: document.getElementById('projectSelect'),
    addProjectBtn: document.getElementById('addProjectBtn'),
    addTaskBtn: document.getElementById('addTaskBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    // Stats
    countBacklog: document.getElementById('countBacklog'),
    countInProgress: document.getElementById('countInProgress'),
    countReview: document.getElementById('countReview'),
    countDone: document.getElementById('countDone'),
    // Lists
    listBacklog: document.getElementById('listBacklog'),
    listInProgress: document.getElementById('listInProgress'),
    listReview: document.getElementById('listReview'),
    listDone: document.getElementById('listDone'),
    // Chart
    statusChart: document.getElementById('statusChart'),
    // Task modal
    taskModal: document.getElementById('taskModal'),
    taskForm: document.getElementById('taskForm'),
    taskId: document.getElementById('taskId'),
    taskProject: document.getElementById('taskProject'),
    taskTitle: document.getElementById('taskTitle'),
    taskDescription: document.getElementById('taskDescription'),
    taskAssignee: document.getElementById('taskAssignee'),
    taskPriority: document.getElementById('taskPriority'),
    taskDueDate: document.getElementById('taskDueDate'),
    taskStatus: document.getElementById('taskStatus'),
    // Project modal
    projectModal: document.getElementById('projectModal'),
    projectForm: document.getElementById('projectForm'),
    projectName: document.getElementById('projectName'),
  };

  // --------- Bootstrap Modal helpers ---------
  function showModal(modalEl) {
    if (window.jQuery && window.jQuery(modalEl).modal) {
      window.jQuery(modalEl).modal('show');
    } else {
      modalEl.style.display = 'block';
    }
  }
  function hideModal(modalEl) {
    if (window.jQuery && window.jQuery(modalEl).modal) {
      window.jQuery(modalEl).modal('hide');
    } else {
      modalEl.style.display = 'none';
    }
  }

  // --------- Initialization ---------
  function seedIfEmpty() {
    if (state.projects.length === 0) {
      const demoProjectId = generateId('proj');
      state.projects.push({ id: demoProjectId, name: 'Demo Project', createdAt: new Date().toISOString() });
      const now = Date.now();
      const demoTasks = [
        { title: 'Set up repository', status: 'backlog', priority: 'medium' },
        { title: 'Define requirements', status: 'inprogress', priority: 'high' },
        { title: 'Create wireframes', status: 'review', priority: 'medium' },
        { title: 'Deploy MVP', status: 'done', priority: 'high' }
      ];
      state.tasks = demoTasks.map((t, idx) => ({
        id: generateId('task'),
        projectId: demoProjectId,
        title: t.title,
        description: '',
        assignee: idx % 2 === 0 ? 'Alex' : 'Jamie',
        priority: t.priority,
        dueDate: new Date(now + (idx + 1) * 86400000).toISOString().slice(0, 10),
        status: t.status,
        createdAt: new Date(now - (idx + 2) * 86400000).toISOString(),
        updatedAt: new Date(now - (idx + 1) * 86400000).toISOString(),
        completedAt: t.status === 'done' ? new Date(now - idx * 3600000).toISOString() : null
      }));
      saveState(state);
    }
  }

  function init() {
    seedIfEmpty();
    currentProjectId = state.projects[0]?.id || null;
    renderProjects();
    renderBoard();
    initDnD();
    initEvents();
    updateStatsAndChart();
  }

  // --------- Renderers ---------
  function renderProjects() {
    const select = els.projectSelect;
    const modalSelect = els.taskProject;
    select.innerHTML = '';
    modalSelect.innerHTML = '';
    state.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      if (p.id === currentProjectId) opt.selected = true;
      select.appendChild(opt);
      const opt2 = opt.cloneNode(true);
      modalSelect.appendChild(opt2);
    });
  }

  function taskCard(task) {
    const div = document.createElement('div');
    div.className = 'kanban-card';
    div.dataset.taskId = task.id;
    div.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div class="title">${escapeHtml(task.title)}</div>
        <span class="badge-status"><span class="status-dot status-${task.status}"></span>${prettyStatus(task.status)}</span>
      </div>
      <div class="meta mt-1">
        <span class="badge-priority ${task.priority}">Priority: ${task.priority}</span>
        ${task.assignee ? `<span>Assignee: ${escapeHtml(task.assignee)}</span>` : ''}
        ${task.dueDate ? `<span>Due: ${escapeHtml(task.dueDate)}</span>` : ''}
      </div>
      <div class="actions">
        <button class="btn btn-sm btn-outline-secondary edit-task">Edit</button>
        <button class="btn btn-sm btn-outline-danger delete-task">Delete</button>
      </div>
    `;
    return div;
  }

  function renderBoard() {
    const lists = {
      backlog: els.listBacklog,
      inprogress: els.listInProgress,
      review: els.listReview,
      done: els.listDone,
    };
    Object.values(lists).forEach(list => list.innerHTML = '');

    const tasks = state.tasks.filter(t => t.projectId === currentProjectId);
    tasks.forEach(t => {
      const card = taskCard(t);
      lists[t.status].appendChild(card);
    });
  }

  function updateStatsAndChart() {
    const tasks = state.tasks.filter(t => t.projectId === currentProjectId);
    const counts = {
      backlog: tasks.filter(t => t.status === 'backlog').length,
      inprogress: tasks.filter(t => t.status === 'inprogress').length,
      review: tasks.filter(t => t.status === 'review').length,
      done: tasks.filter(t => t.status === 'done').length,
    };
    els.countBacklog.textContent = counts.backlog;
    els.countInProgress.textContent = counts.inprogress;
    els.countReview.textContent = counts.review;
    els.countDone.textContent = counts.done;

    const data = [counts.backlog, counts.inprogress, counts.review, counts.done];

    if (!statusChart) {
      statusChart = new window.Chart(els.statusChart.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Backlog', 'In Progress', 'Review', 'Done'],
          datasets: [{
            data,
            backgroundColor: ['#9aa5b1', '#3b82f6', '#f59e0b', '#10b981'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    } else {
      statusChart.data.datasets[0].data = data;
      statusChart.update();
    }
  }

  // --------- DnD ---------
  function initDnD() {
    if (!window.Sortable) return; // graceful degrade
    const lists = [els.listBacklog, els.listInProgress, els.listReview, els.listDone];
    lists.forEach(list => {
      window.Sortable.create(list, {
        group: 'kanban',
        animation: 150,
        ghostClass: 'bg-light',
        onEnd: function(evt) {
          const taskId = evt.item.dataset.taskId;
          const newStatus = listStatusFromElement(evt.to);
          updateTaskStatus(taskId, newStatus);
        }
      });
    });
  }

  function listStatusFromElement(el) {
    switch (el.id) {
      case 'listBacklog': return 'backlog';
      case 'listInProgress': return 'inprogress';
      case 'listReview': return 'review';
      case 'listDone': return 'done';
      default: return 'backlog';
    }
  }

  function updateTaskStatus(taskId, newStatus) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.status = newStatus;
    task.updatedAt = new Date().toISOString();
    if (newStatus === 'done' && !task.completedAt) task.completedAt = new Date().toISOString();
    saveState(state);
    updateStatsAndChart();
  }

  // --------- Events ---------
  function initEvents() {
    els.projectSelect.addEventListener('change', () => {
      currentProjectId = els.projectSelect.value;
      renderBoard();
      updateStatsAndChart();
    });

    els.addProjectBtn.addEventListener('click', () => {
      els.projectName.value = '';
      showModal(els.projectModal);
    });

    els.projectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = els.projectName.value.trim();
      if (!name) return;
      const id = generateId('proj');
      state.projects.push({ id, name, createdAt: new Date().toISOString() });
      saveState(state);
      currentProjectId = id;
      renderProjects();
      renderBoard();
      updateStatsAndChart();
      hideModal(els.projectModal);
    });

    els.addTaskBtn.addEventListener('click', () => {
      openTaskModal();
    });

    els.taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveTaskFromForm();
    });

    // Delegate for edit/delete on cards
    document.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-task');
      if (editBtn) {
        const card = e.target.closest('.kanban-card');
        const taskId = card?.dataset.taskId;
        const task = state.tasks.find(t => t.id === taskId);
        if (task) openTaskModal(task);
        return;
      }
      const delBtn = e.target.closest('.delete-task');
      if (delBtn) {
        const card = e.target.closest('.kanban-card');
        const taskId = card?.dataset.taskId;
        if (taskId && confirm('Delete this task?')) {
          state.tasks = state.tasks.filter(t => t.id !== taskId);
          saveState(state);
          renderBoard();
          updateStatsAndChart();
        }
      }
    });

    // Export/Import
    els.exportBtn.addEventListener('click', () => {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'dashboard-data.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });

    els.importBtn.addEventListener('click', () => {
      els.importFile.click();
    });

    els.importFile.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const incoming = JSON.parse(String(reader.result));
          if (!incoming.projects || !incoming.tasks) throw new Error('Invalid file');
          state = incoming;
          saveState(state);
          currentProjectId = state.projects[0]?.id || null;
          renderProjects();
          renderBoard();
          updateStatsAndChart();
          alert('Import successful');
        } catch (err) {
          alert('Failed to import: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  function openTaskModal(task) {
    els.taskId.value = task?.id || '';
    els.taskProject.value = task?.projectId || currentProjectId;
    els.taskTitle.value = task?.title || '';
    els.taskDescription.value = task?.description || '';
    els.taskAssignee.value = task?.assignee || '';
    els.taskPriority.value = task?.priority || 'medium';
    els.taskDueDate.value = (task?.dueDate || '').slice(0,10);
    els.taskStatus.value = task?.status || 'backlog';
    showModal(els.taskModal);
  }

  function saveTaskFromForm() {
    const id = els.taskId.value || generateId('task');
    const isNew = !els.taskId.value;
    const task = {
      id,
      projectId: els.taskProject.value,
      title: els.taskTitle.value.trim(),
      description: els.taskDescription.value.trim(),
      assignee: els.taskAssignee.value.trim(),
      priority: els.taskPriority.value,
      dueDate: els.taskDueDate.value,
      status: els.taskStatus.value,
      createdAt: isNew ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    };
    if (!task.title) {
      alert('Title is required');
      return;
    }
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) {
      state.tasks.push(task);
    } else {
      const existing = state.tasks[idx];
      state.tasks[idx] = { ...existing, ...task };
    }
    saveState(state);
    hideModal(els.taskModal);
    // Rerender for current project
    renderBoard();
    updateStatsAndChart();
  }

  // --------- Utilities ---------
  function prettyStatus(s) {
    switch (s) {
      case 'backlog': return 'Backlog';
      case 'inprogress': return 'In Progress';
      case 'review': return 'Review';
      case 'done': return 'Done';
      default: return s;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --------- Kickoff ---------
  document.addEventListener('DOMContentLoaded', init);
})();
