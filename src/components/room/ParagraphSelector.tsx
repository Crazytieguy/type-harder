import { useQuery } from "convex/react";
import { BookOpen, CheckCircle, ChevronRight, RotateCcw } from "lucide-react";
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
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);

  const booksHierarchy = useQuery(api.articles.getBooksHierarchy);
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
      setSelectedBook(selectedParagraphDetails.bookTitle);
      setSelectedSequence(selectedParagraphDetails.sequenceTitle);
      setSelectedArticle(selectedParagraphDetails.articleTitle);
    }
  }, [selectedParagraphDetails, mode]);

  const handleModeChange = (newMode: "random" | "next" | "choose") => {
    setMode(newMode);
    onModeChange?.(newMode);
    if (newMode === "random") {
      onSelectParagraph(null);
      setSelectedBook(null);
      setSelectedSequence(null);
      setSelectedArticle(null);
    } else if (newMode === "next" && nextUncompleted) {
      onSelectParagraph(nextUncompleted.paragraphId);
      setSelectedBook(nextUncompleted.paragraph.bookTitle);
      setSelectedSequence(nextUncompleted.paragraph.sequenceTitle);
      setSelectedArticle(nextUncompleted.paragraph.articleTitle);
    } else if (newMode === "choose") {
      onSelectParagraph(null);
    }
  };

  const handleReset = () => {
    setSelectedBook(null);
    setSelectedSequence(null);
    setSelectedArticle(null);
    onSelectParagraph(null);
  };

  if (!booksHierarchy) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const previewParagraph =
    mode === "next" && nextUncompleted
      ? nextUncompleted.paragraph
      : selectedParagraphDetails;

  const completionPercentage =
    booksHierarchy.totalParagraphs > 0
      ? Math.round(
          (booksHierarchy.completedParagraphs / booksHierarchy.totalParagraphs) * 100
        )
      : 0;

  return (
    <div className="space-y-4">
      <div className="tabs tabs-border w-full">
        <button
          type="button"
          className={`tab flex-1 transition-all ${mode === "random" ? "tab-active" : ""}`}
          onClick={() => handleModeChange("random")}
        >
          Random
        </button>
        {nextUncompleted && (
          <button
            type="button"
            className={`tab flex-1 transition-all ${mode === "next" ? "tab-active" : ""}`}
            onClick={() => handleModeChange("next")}
          >
            Continue
          </button>
        )}
        <button
          type="button"
          className={`tab flex-1 transition-all ${mode === "choose" ? "tab-active" : ""}`}
          onClick={() => handleModeChange("choose")}
        >
          <BookOpen className="w-4 h-4 mr-1" />
          Browse
        </button>
      </div>

      {mode === "choose" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-medium">Overall Progress</span>
                <span className="font-mono text-sm">{completionPercentage}%</span>
              </div>
              <div className="progress progress-primary h-2">
                <div
                  className="progress-value"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <div className="text-xs opacity-60 mt-1">
                {booksHierarchy.completedParagraphs} / {booksHierarchy.totalParagraphs} paragraphs completed
              </div>
            </div>
            {(selectedBook || selectedSequence || selectedArticle) && (
              <button
                type="button"
                className="btn btn-sm btn-ghost ml-3"
                onClick={handleReset}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="divider my-2" />

          {booksHierarchy.books.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-base-300 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-lg font-medium mb-2">No Content Available</p>
              <p className="text-sm opacity-60">
                Paragraphs will appear here once they're loaded into the system.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {booksHierarchy.books.map((book) => {
              const isBookExpanded = selectedBook === book.bookTitle;
              const bookCompletedCount = book.sequences.reduce((sum, s) => sum + s.completedParagraphs, 0);
              const bookTotalCount = book.sequences.reduce((sum, s) => sum + s.totalParagraphs, 0);
              const bookProgress = Math.round((bookCompletedCount / bookTotalCount) * 100);

              return (
                <div key={book.bookTitle} className="collapse bg-base-200">
                  <input
                    type="checkbox"
                    checked={isBookExpanded}
                    onChange={() => {
                      if (selectedBook === book.bookTitle) {
                        setSelectedBook(null);
                        setSelectedSequence(null);
                        setSelectedArticle(null);
                      } else {
                        setSelectedBook(book.bookTitle);
                      }
                    }}
                  />
                  <div className="collapse-title pr-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm line-clamp-1">{book.bookTitle}</div>
                        <div className="progress progress-success h-1.5 mt-1.5">
                          <div
                            className="progress-value"
                            style={{ width: `${bookProgress}%` }}
                          />
                        </div>
                      </div>
                      <div className="badge badge-ghost font-mono text-xs flex-shrink-0">
                        {bookCompletedCount}/{bookTotalCount}
                      </div>
                    </div>
                  </div>
                  <div className="collapse-content">
                    <div className="space-y-2 pt-2">
                      {book.sequences.map((sequence) => {
                        const isSequenceExpanded = selectedSequence === sequence.sequenceTitle;
                        const sequenceProgress = Math.round(
                          (sequence.completedParagraphs / sequence.totalParagraphs) * 100
                        );

                        return (
                          <div key={sequence.sequenceTitle} className="collapse bg-base-300">
                            <input
                              type="checkbox"
                              checked={isSequenceExpanded}
                              onChange={() => {
                                if (selectedSequence === sequence.sequenceTitle) {
                                  setSelectedSequence(null);
                                  setSelectedArticle(null);
                                } else {
                                  setSelectedSequence(sequence.sequenceTitle);
                                }
                              }}
                            />
                            <div className="collapse-title min-h-0 py-2 pr-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm line-clamp-1">{sequence.sequenceTitle}</div>
                                  <div className="progress progress-info h-1 mt-1.5">
                                    <div
                                      className="progress-value"
                                      style={{ width: `${sequenceProgress}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="badge badge-ghost badge-sm font-mono flex-shrink-0">
                                  {sequence.completedParagraphs}/{sequence.totalParagraphs}
                                </div>
                              </div>
                            </div>
                            <div className="collapse-content">
                              <div className="space-y-1.5 pt-2">
                                {sequence.articles.map((article) => {
                                  const articleProgress = Math.round(
                                    (article.completedCount / article.paragraphCount) * 100
                                  );
                                  const isArticleSelected = selectedArticle === article.articleTitle;

                                  return (
                                    <button
                                      key={article.articleTitle}
                                      type="button"
                                      onClick={() => {
                                        if (selectedArticle === article.articleTitle) {
                                          setSelectedArticle(null);
                                        } else {
                                          setSelectedArticle(article.articleTitle);
                                        }
                                      }}
                                      className={`w-full text-left p-2 rounded-lg transition-colors ${
                                        isArticleSelected
                                          ? "bg-primary text-primary-content"
                                          : "bg-base-100 hover:bg-base-200"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <div className="text-sm line-clamp-1 flex-1">
                                          {article.articleTitle}
                                        </div>
                                        <ChevronRight className="w-4 h-4 flex-shrink-0" />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className={`progress h-1 flex-1 ${isArticleSelected ? "progress-primary-content" : "progress-accent"}`}>
                                          <div
                                            className="progress-value"
                                            style={{ width: `${articleProgress}%` }}
                                          />
                                        </div>
                                        <div className={`text-xs font-mono flex-shrink-0 ${isArticleSelected ? "opacity-90" : "opacity-60"}`}>
                                          {article.completedCount}/{article.paragraphCount}
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}

          {selectedArticle && articleParagraphs && (
            <>
              <div className="divider my-2">Paragraphs</div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {articleParagraphs.paragraphs.map((para) => {
                  const isSelected = selectedParagraphId === para._id;

                  return (
                    <button
                      key={para._id}
                      type="button"
                      onClick={() => onSelectParagraph(para._id)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        isSelected
                          ? "bg-primary text-primary-content ring-2 ring-primary ring-offset-2 ring-offset-base-100"
                          : para.completed
                          ? "bg-base-200 opacity-50 hover:opacity-70"
                          : "bg-base-200 hover:bg-base-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 pt-0.5">
                          {para.completed ? (
                            <CheckCircle className={`w-4 h-4 ${isSelected ? "text-primary-content" : "text-success"}`} />
                          ) : (
                            <div className={`w-4 h-4 rounded-full border-2 ${isSelected ? "border-primary-content" : "border-base-content/30"}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`badge badge-sm ${isSelected ? "badge-primary-content" : "badge-ghost"}`}>
                              #{para.indexInArticle + 1}
                            </div>
                            <div className={`badge badge-sm font-mono ${isSelected ? "badge-primary-content" : "badge-ghost"}`}>
                              {para.wordCount} words
                            </div>
                          </div>
                          <p className={`text-sm line-clamp-2 ${isSelected ? "" : "opacity-80"}`}>
                            {para.content}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {previewParagraph && (
        <div className="card bg-primary text-primary-content">
          <div className="card-body p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs opacity-80 line-clamp-1">
                  {previewParagraph.bookTitle} → {previewParagraph.sequenceTitle}
                </div>
                <div className="font-medium line-clamp-1 mt-1">
                  {previewParagraph.articleTitle}
                </div>
              </div>
              <div className="badge badge-primary-content badge-sm font-mono flex-shrink-0">
                {previewParagraph.wordCount}w
              </div>
            </div>
            <p className="text-sm opacity-90 line-clamp-3">
              {previewParagraph.content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
