/**
 * TODO Manager for Linear Agent
 * 
 * Manages TODO items created during agent sessions
 * and links them to Linear issues for tracking.
 */



interface TodoItem {
  id: string;
  sessionId: string;
  issueId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  linearIssueId?: string; // If linked to a Linear issue
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface CreateTodoOptions {
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assignToSession?: boolean;
  createLinearIssue?: boolean;
}

/**
 * TODO Manager for tracking tasks during agent sessions
 */
export class TodoManager {
  private todos = new Map<string, TodoItem>();
  private sessionTodos = new Map<string, string[]>(); // sessionId -> todoIds

  /**
   * Create a new TODO item
   */
  async createTodo(
    sessionId: string,
    issueId: string,
    title: string,
    description: string = '',
    options: CreateTodoOptions = {}
  ): Promise<TodoItem> {
    const todoId = this.generateTodoId();
    
    const todo: TodoItem = {
      id: todoId,
      sessionId,
      issueId,
      title,
      description,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priority: options.priority || 'medium'
    };

    this.todos.set(todoId, todo);
    
    // Track todos by session
    if (!this.sessionTodos.has(sessionId)) {
      this.sessionTodos.set(sessionId, []);
    }
    this.sessionTodos.get(sessionId)!.push(todoId);

    console.log(`📋 Created TODO ${todoId}: ${title}`);
    
    // Optionally create Linear issue for this TODO
    if (options.createLinearIssue) {
      await this.createLinearIssueForTodo(todoId);
    }

    return todo;
  }

  /**
   * Update TODO status
   */
  updateTodoStatus(todoId: string, status: TodoItem['status']): TodoItem | null {
    const todo = this.todos.get(todoId);
    if (!todo) {
      return null;
    }

    todo.status = status;
    todo.updatedAt = new Date().toISOString();
    
    console.log(`📝 Updated TODO ${todoId} status to ${status}`);
    return todo;
  }

  /**
   * Get TODO by ID
   */
  getTodo(todoId: string): TodoItem | null {
    return this.todos.get(todoId) || null;
  }

  /**
   * Get all TODOs for a session
   */
  getSessionTodos(sessionId: string): TodoItem[] {
    const todoIds = this.sessionTodos.get(sessionId) || [];
    return todoIds
      .map(id => this.todos.get(id))
      .filter(todo => todo !== undefined) as TodoItem[];
  }

  /**
   * Get all TODOs for an issue
   */
  getIssueTodos(issueId: string): TodoItem[] {
    return Array.from(this.todos.values())
      .filter(todo => todo.issueId === issueId);
  }

  /**
   * Get TODO statistics
   */
  getTodoStats(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  } {
    const todos = Array.from(this.todos.values());
    
    return {
      total: todos.length,
      pending: todos.filter(t => t.status === 'pending').length,
      inProgress: todos.filter(t => t.status === 'in_progress').length,
      completed: todos.filter(t => t.status === 'completed').length,
      cancelled: todos.filter(t => t.status === 'cancelled').length
    };
  }

  /**
   * Create a Linear issue for a TODO item
   */
  private async createLinearIssueForTodo(todoId: string): Promise<void> {
    const todo = this.todos.get(todoId);
    if (!todo) {
      return;
    }

    try {
      // This would integrate with Linear client to create an issue
      // For now, just mark that it should be linked
      todo.linearIssueId = `todo-${todoId}`;
      
      console.log(`🔗 Would create Linear issue for TODO ${todoId}: ${todo.title}`);
      
      // TODO: Implement actual Linear issue creation
      // const linearClient = new LinearClient({ apiKey: process.env.LINEAR_BOT_OAUTH_TOKEN });
      // const issue = await linearClient.issueCreate({
      //   title: `[TODO] ${todo.title}`,
      //   description: todo.description,
      //   teamId: todo.teamId
      // });
      // todo.linearIssueId = issue.id;
      
    } catch (error) {
      console.error(`❌ Failed to create Linear issue for TODO ${todoId}:`, error);
    }
  }

  /**
   * Generate unique TODO ID
   */
  private generateTodoId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `todo_${timestamp}_${random}`;
  }

  /**
   * Format TODO list for display
   */
  formatTodoList(todos: TodoItem[]): string {
    if (todos.length === 0) {
      return '📋 No TODO items found.';
    }

    const statusEmoji = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌'
    };

    const priorityEmoji = {
      low: '🔵',
      medium: '🟡', 
      high: '🟠',
      urgent: '🔴'
    };

    return todos.map(todo => 
      `${statusEmoji[todo.status]} ${priorityEmoji[todo.priority]} **${todo.title}**\n` +
      `${todo.description ? `   ${todo.description}\n` : ''}` +
      `   _ID: ${todo.id} | Created: ${new Date(todo.createdAt).toLocaleDateString()}_`
    ).join('\n\n');
  }

  /**
   * Clean up completed TODOs (older than 24 hours)
   */
  cleanupCompletedTodos(): void {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    const todosToRemove: string[] = [];

    for (const [todoId, todo] of this.todos.entries()) {
      if (
        todo.status === 'completed' && 
        new Date(todo.updatedAt).getTime() < twentyFourHoursAgo
      ) {
        todosToRemove.push(todoId);
      }
    }

    for (const todoId of todosToRemove) {
      const todo = this.todos.get(todoId);
      if (todo) {
        // Remove from session tracking
        const sessionTodoList = this.sessionTodos.get(todo.sessionId);
        if (sessionTodoList) {
          const index = sessionTodoList.indexOf(todoId);
          if (index > -1) {
            sessionTodoList.splice(index, 1);
          }
        }
        
        // Remove TODO
        this.todos.delete(todoId);
        console.log(`🧹 Cleaned up completed TODO ${todoId}`);
      }
    }
  }
}

export const todoManager = new TodoManager();