'use client';

import { useWorkflowStore } from '@/store/workflow-store';
import StepIndicator from '@/components/StepIndicator';
import UploadZone from '@/components/UploadZone';
import VariationGrid from '@/components/VariationGrid';
import MockupEditor from '@/components/MockupEditor';

export default function Home() {
    const { currentStep } = useWorkflowStore();

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="app-logo">
                    <div className="logo-icon">🎨</div>
                    Design Variation Tool
                </div>
            </header>

            <StepIndicator />

            <main className="app-main">
                {currentStep === 'upload' && <UploadZone />}
                {currentStep === 'variations' && <VariationGrid />}
                {currentStep === 'mockup' && <MockupEditor />}
            </main>
        </div>
    );
}
