interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    className?: string;
}

export default function Skeleton({ width = '100%', height = 20, borderRadius = 4, className }: SkeletonProps) {
    return (
        <div
            className={`skeleton ${className || ''}`}
            style={{ width, height, borderRadius }}
        />
    );
}
