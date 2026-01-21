import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Trash2, Edit2, X, Save } from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import '../styles/components.css';

export const TaskItem = ({ task }) => {
    const { toggleTask, deleteTask, editTask } = useTaskStore();
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(task.title);

    const handleSave = () => {
        if (editValue.trim()) {
            editTask(task.id, editValue);
            setIsEditing(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            setEditValue(task.title);
            setIsEditing(false);
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
            className={`task-item ${task.completed ? 'completed' : ''}`}
        >
            <button
                className={`checkbox ${task.completed ? 'checked' : ''}`}
                onClick={() => toggleTask(task.id)}
            >
                {task.completed && <Check size={16} />}
            </button>

            <div className="task-content">
                {isEditing ? (
                    <input
                        autoFocus
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleSave}
                        className="edit-input"
                    />
                ) : (
                    <span className="task-text" onClick={() => toggleTask(task.id)}>
                        {task.title}
                    </span>
                )}
            </div>

            <div className="task-actions">
                <button
                    className="icon-btn edit-btn"
                    onClick={() => setIsEditing(!isEditing)}
                    aria-label="Edit task"
                >
                    {isEditing ? <Save size={18} /> : <Edit2 size={18} />}
                </button>
                <button
                    className="icon-btn delete-btn"
                    onClick={() => deleteTask(task.id)}
                    aria-label="Delete task"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </motion.div>
    );
};
