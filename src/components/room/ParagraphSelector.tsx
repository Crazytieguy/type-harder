import { useQuery } from "convex/react";
import { Shuffle, Target, CheckCircle, Circle, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface ParagraphSelectorProps {
  selectedParagraphId: Id<"paragraphs"> | null;
  onSelectParagraph: (paragraphId: Id<"paragraphs"> | null) => void;
}

export default function ParagraphSelector({
  selectedParagraphId,
  onSelectParagraph,
}: ParagraphSelectorProps) {
  const [mode, setMode] = useState<"random" | "select">("random");
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState(false);

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

  // Auto-select article when a paragraph is selected
  useEffect(() => {
    if (selectedParagraphDetails && mode === "select") {
      setSelectedArticle(selectedParagraphDetails.articleTitle);
    }
  }, [selectedParagraphDetails, mode]);

  const handleModeChange = (newMode: "random" | "select") => {
    setMode(newMode);
    if (newMode === "random") {
      onSelectParagraph(null);
      setSelectedArticle(null);
    }
  };

  const handleNextUncompleted = () => {
    if (nextUncompleted) {
      onSelectParagraph(nextUncompleted.paragraphId);
      setSelectedArticle(nextUncompleted.paragraph.articleTitle);
      setMode("select");
    }
  };

  if (!articles) {
    return <div className="loading loading-spinner loading-sm" />;
  }

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleModeChange("random")}
          className={`btn btn-sm flex-1 ${mode === "random" ? "btn-primary" : "btn-outline"}`}
        >
          <Shuffle className="w-4 h-4" />
          Random
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("select")}
          className={`btn btn-sm flex-1 ${mode === "select" ? "btn-primary" : "btn-outline"}`}
        >
          <Target className="w-4 h-4" />
          Select Paragraph
        </button>
      </div>

      {/* Next Uncompleted Button - Always visible when available */}
      {nextUncompleted && (
        <button
          type="button"
          onClick={handleNextUncompleted}
          className="btn btn-success btn-sm w-full"
        >
          <ArrowRight className="w-4 h-4" />
          Next Uncompleted: {nextUncompleted.paragraph.articleTitle} (#{nextUncompleted.paragraph.indexInArticle + 1})
        </button>
      )}

      {/* Selection UI */}
      {mode === "select" && (
        <div className="space-y-3">
          {/* Progress Overview */}
          <div className="stats stats-sm bg-base-200 w-full">
            <div className="stat">
              <div className="stat-title">Progress</div>
              <div className="stat-value text-lg">
                {articles.userCompletedCount} / {articles.totalParagraphs}
              </div>
              <div className="stat-desc">
                {articles.totalParagraphs ? Math.round((articles.userCompletedCount / articles.totalParagraphs) * 100) : 0}% complete
              </div>
            </div>
          </div>

          {/* Article Selector */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Select Article</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={selectedArticle || ""}
              onChange={(e) => {
                setSelectedArticle(e.target.value);
                setExpandedArticle(true);
              }}
            >
              <option value="">Choose an article...</option>
              {articles.articles.map((article) => (
                <option key={article.articleTitle} value={article.articleTitle}>
                  {article.articleTitle} ({article.completedParagraphs}/{article.totalParagraphs})
                </option>
              ))}
            </select>
          </div>

          {/* Paragraph List */}
          {selectedArticle && articleParagraphs && expandedArticle && (
            <div className="card bg-base-200">
              <div className="card-body p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-sm">{selectedArticle}</h4>
                  <button
                    type="button"
                    onClick={() => setExpandedArticle(false)}
                    className="btn btn-ghost btn-xs"
                  >
                    Collapse
                  </button>
                </div>
                
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {articleParagraphs.paragraphs.map((para) => (
                    <button
                      key={para._id}
                      type="button"
                      onClick={() => onSelectParagraph(para._id)}
                      className={`btn btn-sm w-full justify-start ${
                        selectedParagraphId === para._id
                          ? "btn-primary"
                          : para.completed
                          ? "btn-ghost opacity-60"
                          : "btn-outline"
                      }`}
                    >
                      <span className="flex items-center gap-2 w-full">
                        {para.completed ? (
                          <CheckCircle className="w-4 h-4 text-success shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 shrink-0" />
                        )}
                        <span className="text-left flex-1">
                          Paragraph {para.indexInArticle + 1}
                        </span>
                        <span className="text-xs opacity-70">
                          {para.wordCount} words
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Selected Paragraph Preview */}
          {selectedParagraphDetails && (
            <div className="card bg-base-100 border border-primary">
              <div className="card-body p-3">
                <div className="text-xs opacity-70 mb-1">
                  {selectedParagraphDetails.bookTitle} → {selectedParagraphDetails.sequenceTitle}
                </div>
                <div className="text-sm font-medium mb-2">
                  {selectedParagraphDetails.articleTitle} (#{selectedParagraphDetails.indexInArticle + 1})
                </div>
                <div className="text-xs line-clamp-3 opacity-80">
                  {selectedParagraphDetails.content}
                </div>
                <div className="text-xs mt-2 font-medium">
                  {selectedParagraphDetails.wordCount} words
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}