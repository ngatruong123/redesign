'use client';

import { useWorkflowStore } from '@/store/workflow-store';
import type { WorkflowStep } from '@/types';

const steps: { id: WorkflowStep; label: string }[] = [
    { id: 'upload', label: 'Upload Design' },
    { id: 'variations', label: 'AI Variations' },
    { id: 'mockup', label: 'Mockup' },
    { id: 'video', label: 'Video' },
];

export default function StepIndicator() {
    const { currentStep, setStep, sourceDesigns, variations } = useWorkflowStore();

    const currentIdx = steps.findIndex((s) => s.id === currentStep);

    const canNavigate = (stepId: WorkflowStep) => {
        if (stepId === 'upload') return true;
        if (stepId === 'variations') return sourceDesigns.length > 0;
        if (stepId === 'mockup') return true;
        if (stepId === 'video') return true;
        return false;
    };

    return (
        <div className="step-indicator">
            {steps.map((step, i) => (
                <div key={step.id} className="step-item-row">
                    <div
                        className={`step-item ${step.id === currentStep ? 'active' : ''} ${i < currentIdx ? 'completed' : ''}`}
                        onClick={() => canNavigate(step.id) && setStep(step.id)}
                        style={{ cursor: canNavigate(step.id) ? 'pointer' : 'default' }}
                    >
                        <div className="step-circle">{i < currentIdx ? '✓' : i + 1}</div>
                        <span className="step-label">{step.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                        <div className={`step-connector ${i < currentIdx ? 'completed' : ''}`} />
                    )}
                </div>
            ))}
        </div>
    );
}
