import { useQuery } from "convex/react";
import { CheckCircle, Circle } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface ParagraphSelectorProps {
  selectedParagraphId: Id<"paragraphs"> | null;
  onSelectParagraph: (paragraphId: Id<"paragraphs"> | null) => void;
  onModeChange?: (mode: "random" | "next" | "choose") => void;
}

export default function ParagraphSelector({
  selectedParagraphId,
  onSelectParagraph,
  onModeChange,
}: ParagraphSelectorProps) {
  const [mode, setMode] = useState<"random" | "next" | "choose">("random");
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);

  const articles = useQuery(api.articles.getArticles);
  const articleParagraphs = useQuery(
    api.articles.getArticleParagraphs,
    selectedArticle ? { articleTitle: selectedArticle } : "skip"
  );
  const nextUncompleted = useQuery(api.articles.getNextUncompletedParagraph);
  const selectedParagraphDetails = useQuery(
    api.articles.getParagraphById,
    selectedParagraphId ? { paragraphId: selectedParagraphId } : "skip"
  );

  useEffect(() => {
    if (selectedParagraphDetails && mode === "choose") {
      setSelectedArticle(selectedParagraphDetails.articleTitle);
    }
  }, [selectedParagraphDetails, mode]);

  const handleModeChange = (newMode: "random" | "next" | "choose") => {
    setMode(newMode);
    onModeChange?.(newMode);
    if (newMode === "random") {
      onSelectParagraph(null);
      setSelectedArticle(null);
    } else if (newMode === "next" && nextUncompleted) {
      onSelectParagraph(nextUncompleted.paragraphId);
      setSelectedArticle(nextUncompleted.paragraph.articleTitle);
    } else if (newMode === "choose") {
      onSelectParagraph(null);
    }
  };

  if (!articles) {
    return <div className="loading loading-spinner loading-sm" />;
  }

  const completionPercent = articles.totalParagraphs
    ? Math.round((articles.userCompletedCount / articles.totalParagraphs) * 100)
    : 0;

  const previewParagraph = mode === "next" && nextUncompleted ? nextUncompleted.paragraph : selectedParagraphDetails;

  return (
    <div className="space-y-3">
      <div className="tabs tabs-box tabs-sm">
        <button
          type="button"
          className={`tab ${mode === "random" ? "tab-active" : ""}`}
          onClick={() => handleModeChange("random")}
        >
          Random
        </button>
        {nextUncompleted && (
          <button
            type="button"
            className={`tab ${mode === "next" ? "tab-active" : ""}`}
            onClick={() => handleModeChange("next")}
          >
            Next Uncompleted
          </button>
        )}
        <button
          type="button"
          className={`tab ${mode === "choose" ? "tab-active" : ""}`}
          onClick={() => handleModeChange("choose")}
        >
          Choose Specific
        </button>
      </div>

      {mode === "choose" && (
        <div className="space-y-3">
          <div className="text-xs opacity-70">
            Progress: {articles.userCompletedCount} / {articles.totalParagraphs} ({completionPercent}%)
          </div>

          <select
            className="select select-sm w-full"
            value={selectedArticle || ""}
            onChange={(e) => setSelectedArticle(e.target.value)}
          >
            <option value="">Select an article...</option>
            {articles.articles.map((article) => (
              <option key={article.articleTitle} value={article.articleTitle}>
                {article.articleTitle} ({article.completedParagraphs}/{article.totalParagraphs})
              </option>
            ))}
          </select>

          {selectedArticle && articleParagraphs && (
            <details className="collapse collapse-arrow bg-base-200" open>
              <summary className="collapse-title text-sm font-medium min-h-0 py-2">
                Paragraphs
              </summary>
              <div className="collapse-content">
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {articleParagraphs.paragraphs.map((para) => (
                    <button
                      key={para._id}
                      type="button"
                      onClick={() => onSelectParagraph(para._id)}
                      className={`btn btn-sm w-full justify-start flex-col items-start h-auto py-2 ${
                        selectedParagraphId === para._id
                          ? "btn-primary"
                          : para.completed
                          ? "btn-ghost opacity-50"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 w-full">
                        {para.completed ? (
                          <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 flex-shrink-0" />
                        )}
                        <span className="flex-1 text-left font-medium">#{para.indexInArticle + 1}</span>
                        <span className="text-xs opacity-70">{para.wordCount}w</span>
                      </div>
                      <div className="text-xs opacity-70 line-clamp-1 w-full text-left pl-6">
                        {para.content}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          )}
        </div>
      )}

      {previewParagraph && (
        <div className="p-3 bg-base-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="opacity-70">{previewParagraph.bookTitle} → {previewParagraph.sequenceTitle}</span>
            <span className="opacity-70">{previewParagraph.wordCount} words</span>
          </div>
          <div className="font-medium text-sm">
            {previewParagraph.articleTitle} (#{previewParagraph.indexInArticle + 1})
          </div>
          <div className="text-sm opacity-80 line-clamp-3">{previewParagraph.content}</div>
        </div>
      )}
    </div>
  );
}
