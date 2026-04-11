import type { DialogueResult, DialogueTask } from '../types/dialogue.js'

export interface DialogueService {
  execute(task: DialogueTask): Promise<DialogueResult>
}
