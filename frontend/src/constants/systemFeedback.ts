// What system feedback can be, said once: the dialog that sends it and the
// admin page that reads it both draw from here.

import { Bug, Heart, Lightbulb, MessageCircle } from 'lucide-react';
import type { SystemFeedbackCategory } from '@/types';

/** Mirrors `SystemFeedback.CATEGORIES` in `apps/system_feedback/models.py`. */
export const FEEDBACK_CATEGORIES: {
  key: SystemFeedbackCategory;
  label: string;
  icon: React.ElementType;
  /** The admin page's chip. */
  tint: string;
}[] = [
  { key: 'problem', label: 'Problem', icon: Bug, tint: 'bg-red-50 text-red-700 border-red-200' },
  { key: 'idea', label: 'Idea', icon: Lightbulb, tint: 'bg-amber-50 text-amber-800 border-amber-200' },
  { key: 'praise', label: 'Praise', icon: Heart, tint: 'bg-green-50 text-green-700 border-green-200' },
  { key: 'other', label: 'Other', icon: MessageCircle, tint: 'bg-gray-50 text-gray-700 border-gray-200' },
];

/** Mirrors `SystemFeedback.MESSAGE_MAX` and the serializer's `MESSAGE_MIN`. */
export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_MESSAGE_MIN = 5;
