import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useTaskStore = create(
    persist(
        (set) => ({
            tasks: [],
            addTask: (title) =>
                set((state) => ({
                    tasks: [
                        { id: crypto.randomUUID(), title, completed: false, createdAt: new Date().toISOString() },
                        ...state.tasks,
                    ],
                })),
            deleteTask: (id) =>
                set((state) => ({
                    tasks: state.tasks.filter((task) => task.id !== id),
                })),
            toggleTask: (id) =>
                set((state) => ({
                    tasks: state.tasks.map((task) =>
                        task.id === id ? { ...task, completed: !task.completed } : task
                    ),
                })),
            editTask: (id, newTitle) =>
                set((state) => ({
                    tasks: state.tasks.map((task) =>
                        task.id === id ? { ...task, title: newTitle } : task
                    )
                }))
        }),
        {
            name: 'task-storage',
        }
    )
);
