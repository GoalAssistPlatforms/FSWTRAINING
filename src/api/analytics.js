import { getTeamStats } from './manager'

/**
 * Fetch and aggregate the team's completion rates.
 * Returns { totalAssigned, totalCompleted, totalInProgress, totalOverdue, overallCompletionPercent }
 */
export const getTeamCompletionRates = async () => {
    const { stats } = await getTeamStats()

    let totalAssigned = 0
    let totalCompleted = 0
    let totalInProgress = 0
    let totalOverdue = 0

    const now = new Date()

    if (!stats) return { totalAssigned: 0, totalCompleted: 0, totalInProgress: 0, totalOverdue: 0, overallCompletionPercent: 0 }

    stats.forEach(member => {
        totalAssigned += member.totalAssigned
        totalCompleted += member.completed
        totalInProgress += member.inProgress

        // Check for overdue assignments
        if (member.progressData) {
            member.progressData.forEach(p => {
                if (p.due_date && (p.status === 'assigned' || p.status === 'in-progress')) {
                    const dueDate = new Date(p.due_date)
                    if (dueDate < now) {
                        totalOverdue++
                    }
                }
            })
        }
    })

    const overallCompletionPercent = totalAssigned > 0 
        ? Math.round((totalCompleted / totalAssigned) * 100) 
        : 0

    return {
        totalAssigned,
        totalCompleted,
        totalInProgress,
        totalOverdue,
        overallCompletionPercent,
        memberStats: stats // pass down for granular data
    }
}

/**
 * Generate and download a CSV file of the team's entire progress report.
 */
export const exportTeamDataCSV = async () => {
    const { stats } = await getTeamStats()
    if (!stats || stats.length === 0) return false

    // Prepare CSV header
    const headers = ['Email', 'Role', 'Total Assigned', 'Completed', 'In Progress', 'Overdue']
    const rows = []

    const now = new Date()

    stats.forEach(member => {
        let overdueCount = 0
        if (member.progressData) {
            member.progressData.forEach(p => {
                if (p.due_date && (p.status === 'assigned' || p.status === 'in-progress')) {
                    if (new Date(p.due_date) < now) overdueCount++
                }
            })
        }

        rows.push([
            member.email,
            member.team_role || 'member',
            member.totalAssigned,
            member.completed,
            member.inProgress,
            overdueCount
        ])
    })

    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\n')

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `Team_Training_Report_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    return true
}
