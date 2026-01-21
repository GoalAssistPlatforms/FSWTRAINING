import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import '../styles/components.css';

export const AddTask = () => {
    const addTask = useTaskStore((state) => state.addTask);
    const [title, setTitle] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (title.trim()) {
            addTask(title);
            setTitle('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="add-task-form">
            <div className="input-group">
                <input
                    type="text"
                    placeholder="What needs to be done?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="task-input"
                />
                <button type="submit" className="add-btn" disabled={!title.trim()}>
                    <Plus size={24} />
                </button>
            </div>
        </form>
    );
};
