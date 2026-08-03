import React, { useState } from 'react';
import { LayoutGrid, ListFilter, Plus, Clock } from 'lucide-react';

export default function TaskBoard({ tasks, onUpdateTaskStatus }) {
  const [viewMode, setViewMode] = useState('board'); // 'board' or 'list'

  const columns = [
    { id: 'Not started', title: 'Not Started / Scheduled', items: tasks.filter(t => t.status === 'Not started' || t.status === 'Scheduled') },
    { id: 'In progress', title: 'In Progress', items: tasks.filter(t => t.status === 'In progress' || t.status === 'Waiting') },
    { id: 'Needs approval', title: 'Needs Approval / Review', items: tasks.filter(t => t.status === 'Needs approval') }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Task Operations Queue</h1>
          <p className="text-muted">Track team and agent operational tasks across workflow stages.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={viewMode === 'list' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setViewMode('list')}>
            <ListFilter size={14} /> List
          </button>
          <button className={viewMode === 'board' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setViewMode('board')}>
            <LayoutGrid size={14} /> Board
          </button>
        </div>
      </div>

      {viewMode === 'board' ? (
        /* Kanban Board View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {columns.map((col) => (
            <div key={col.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '400px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-divider)', paddingBottom: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>{col.title}</span>
                <span className="tag tag-neutral">{col.items.length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {col.items.map((task) => (
                  <div key={task.id} style={{ padding: '12px', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{task.title}</div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: task.avatarColor || 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '10px' }}>
                          {task.avatarLetter || task.assignee[0]}
                        </div>
                        <span style={{ color: 'var(--color-muted)' }}>{task.assignee}</span>
                      </div>
                      <span className={task.priority === 'High' ? 'tag tag-accent-2' : 'tag tag-outline'}>
                        {task.priority}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: 'var(--color-muted)', paddingTop: '4px', borderTop: '1px solid var(--color-divider)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={10} /> {task.due}
                      </span>

                      <select
                        value={task.status}
                        onChange={(e) => onUpdateTaskStatus(task.id, e.target.value)}
                        style={{ background: 'transparent', color: 'var(--color-accent)', border: 'none', fontSize: '10px', cursor: 'pointer' }}
                      >
                        <option value="Not started">Move to Not Started</option>
                        <option value="In progress">Move to In Progress</option>
                        <option value="Needs approval">Move to Review</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task Title</th>
                  <th>Assignee</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td style={{ fontWeight: 700 }}>{task.title}</td>
                    <td>{task.assignee}</td>
                    <td><span className={task.priority === 'High' ? 'tag tag-accent-2' : 'tag tag-outline'}>{task.priority}</span></td>
                    <td>{task.due}</td>
                    <td>
                      <select
                        value={task.status}
                        onChange={(e) => onUpdateTaskStatus(task.id, e.target.value)}
                        style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-divider)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}
                      >
                        <option value="Not started">Not started</option>
                        <option value="In progress">In progress</option>
                        <option value="Needs approval">Needs approval</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
