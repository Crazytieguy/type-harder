import { useQuery } from "convex/react";
import { BookOpen, CheckCircle, ChevronRight, RotateCcw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  const [selectedBook, setSelectedBook] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedBook");
    }
    return null;
  });
  const [selectedSequence, setSelectedSequence] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedSequence");
    }
    return null;
  });
  const [selectedArticle, setSelectedArticle] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedArticle");
    }
    return null;
  });

  // Always fetch booksHierarchy - it's cacheable and lightweight
  const booksHierarchy = useQuery(api.articles.getBooksHierarchy);
  const userCompletions = useQuery(
    api.articles.getUserArticleCompletions,
    mode === "choose" ? {} : "skip"
  );
  const articleParagraphs = useQuery(
    api.articles.getArticleParagraphs,
    selectedArticle && mode === "choose" ? { articleTitle: selectedArticle } : "skip"
  );
  // Always fetch to determine if Continue tab should show
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

  // Consolidated localStorage sync
  useEffect(() => {
    if (selectedBook) {
      localStorage.setItem("selectedBook", selectedBook);
    } else {
      localStorage.removeItem("selectedBook");
    }

    if (selectedSequence) {
      localStorage.setItem("selectedSequence", selectedSequence);
    } else {
      localStorage.removeItem("selectedSequence");
    }

    if (selectedArticle) {
      localStorage.setItem("selectedArticle", selectedArticle);
    } else {
      localStorage.removeItem("selectedArticle");
    }
  }, [selectedBook, selectedSequence, selectedArticle]);

  // Validate localStorage selections against actual database data (one-time on mount)
  const hasValidated = useRef(false);
  useEffect(() => {
    if (!booksHierarchy || hasValidated.current) return;
    hasValidated.current = true;

    // Validate selectedBook
    if (selectedBook) {
      const bookExists = booksHierarchy.books.some(b => b.bookTitle === selectedBook);
      if (!bookExists) {
        setSelectedBook(null);
        setSelectedSequence(null);
        setSelectedArticle(null);
        return;
      }

      // Validate selectedSequence
      if (selectedSequence) {
        const book = booksHierarchy.books.find(b => b.bookTitle === selectedBook);
        const sequenceExists = book?.sequences.some(s => s.sequenceTitle === selectedSequence);
        if (!sequenceExists) {
          setSelectedSequence(null);
          setSelectedArticle(null);
          return;
        }

        // Validate selectedArticle
        if (selectedArticle) {
          const sequence = book?.sequences.find(s => s.sequenceTitle === selectedSequence);
          const articleExists = sequence?.articles.some(a => a.articleTitle === selectedArticle);
          if (!articleExists) {
            setSelectedArticle(null);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booksHierarchy]);

  // Handle next mode paragraph selection after query loads
  useEffect(() => {
    if (mode === "next" && nextUncompleted) {
      onSelectParagraph(nextUncompleted.paragraphId);
      setSelectedBook(nextUncompleted.paragraph.bookTitle);
      setSelectedSequence(nextUncompleted.paragraph.sequenceTitle);
      setSelectedArticle(nextUncompleted.paragraph.articleTitle);
    }
    // onSelectParagraph is a stable callback from parent, excluding to avoid unnecessary re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nextUncompleted]);

  const handleModeChange = (newMode: "random" | "next" | "choose") => {
    setMode(newMode);
    onModeChange?.(newMode);
    if (newMode === "random") {
      onSelectParagraph(null);
      setSelectedBook(null);
      setSelectedSequence(null);
      setSelectedArticle(null);
    } else if (newMode === "choose") {
      onSelectParagraph(null);
    }
    // "next" mode is handled by useEffect above
  };

  const handleReset = () => {
    setSelectedBook(null);
    setSelectedSequence(null);
    setSelectedArticle(null);
    onSelectParagraph(null);
  };

  const previewParagraph =
    mode === "next" && nextUncompleted
      ? nextUncompleted.paragraph
      : selectedParagraphDetails;

  const completionPercentage =
    userCompletions && booksHierarchy && booksHierarchy.totalParagraphs > 0
      ? Math.round(
          (userCompletions.totalCompleted / booksHierarchy.totalParagraphs) * 100
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
          {!booksHierarchy || !userCompletions ? (
            <div className="flex items-center justify-center p-8">
              <div className="loading loading-spinner loading-lg text-primary" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-medium opacity-80">Overall Progress</span>
                    <span className="font-mono text-sm opacity-70">{completionPercentage}%</span>
                  </div>
                  <div className="progress h-1.5">
                    <div
                      className="progress-value bg-primary/60"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                  <div className="text-xs opacity-50 mt-1">
                    {userCompletions.totalCompleted} / {booksHierarchy.totalParagraphs} paragraphs
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

              {/* Breadcrumbs for selected items */}
              {selectedBook && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    className="badge badge-lg badge-primary gap-2 max-w-xs truncate"
                    onClick={() => {
                      setSelectedBook(null);
                      setSelectedSequence(null);
                      setSelectedArticle(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSelectedBook(null);
                        setSelectedSequence(null);
                        setSelectedArticle(null);
                      }
                    }}
                    aria-label={`Navigate back from ${selectedBook} to book selection`}
                  >
                    {selectedBook}
                    <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  </button>
                  {selectedSequence && (
                    <button
                      type="button"
                      className="badge badge-lg badge-primary gap-2 max-w-xs truncate"
                      onClick={() => {
                        setSelectedSequence(null);
                        setSelectedArticle(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setSelectedSequence(null);
                          setSelectedArticle(null);
                        }
                      }}
                      aria-label={`Navigate back from ${selectedSequence} to sequence selection`}
                    >
                      {selectedSequence}
                      <ChevronRight className="w-3 h-3 flex-shrink-0" />
                    </button>
                  )}
                  {selectedArticle && (
                    <button
                      type="button"
                      className="badge badge-lg badge-primary gap-2 max-w-xs truncate"
                      onClick={() => setSelectedArticle(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setSelectedArticle(null);
                        }
                      }}
                      aria-label={`Navigate back from ${selectedArticle} to article selection`}
                    >
                      {selectedArticle}
                      <ChevronRight className="w-3 h-3 flex-shrink-0" />
                    </button>
                  )}
                </div>
              )}

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
              ) : !selectedBook ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {booksHierarchy.books.map((book) => {
                    const bookTotalCount = book.sequences.reduce((sum, s) => sum + s.totalParagraphs, 0);
                    const bookCompletedCount = book.sequences.reduce((sum, seq) => {
                      return sum + seq.articles.reduce((articleSum, article) => {
                        return articleSum + (userCompletions.completionsByArticle[article.articleTitle] || 0);
                      }, 0);
                    }, 0);
                    const bookProgress = bookTotalCount > 0 ? Math.round((bookCompletedCount / bookTotalCount) * 100) : 0;

                    return (
                      <button
                        key={book.bookTitle}
                        type="button"
                        onClick={() => {
                          setSelectedBook(book.bookTitle);
                          setSelectedSequence(null);
                          setSelectedArticle(null);
                        }}
                        className="w-full text-left p-3 rounded-lg bg-base-200 hover:bg-base-300 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm line-clamp-1">{book.bookTitle}</div>
                            <div className="progress h-1 mt-1.5">
                              <div
                                className="progress-value bg-success/50"
                                style={{ width: `${bookProgress}%` }}
                              />
                            </div>
                          </div>
                          <div className="font-mono text-xs opacity-50 flex-shrink-0">
                            {bookCompletedCount}/{bookTotalCount}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : !selectedSequence ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {booksHierarchy.books
                    .find(b => b.bookTitle === selectedBook)
                    ?.sequences.map((sequence) => {
                      const sequenceCompletedCount = sequence.articles.reduce((sum, article) => {
                        return sum + (userCompletions.completionsByArticle[article.articleTitle] || 0);
                      }, 0);
                      const sequenceProgress = sequence.totalParagraphs > 0
                        ? Math.round((sequenceCompletedCount / sequence.totalParagraphs) * 100)
                        : 0;

                      return (
                        <button
                          key={sequence.sequenceTitle}
                          type="button"
                          onClick={() => {
                            setSelectedSequence(sequence.sequenceTitle);
                            setSelectedArticle(null);
                          }}
                          className="w-full text-left p-3 rounded-lg bg-base-200 hover:bg-base-300 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
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
                              {sequenceCompletedCount}/{sequence.totalParagraphs}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              ) : !selectedArticle ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {booksHierarchy.books
                    .find(b => b.bookTitle === selectedBook)
                    ?.sequences.find(s => s.sequenceTitle === selectedSequence)
                    ?.articles.map((article) => {
                      const articleCompletedCount = userCompletions.completionsByArticle[article.articleTitle] || 0;
                      const articleProgress = article.paragraphCount > 0
                        ? Math.round((articleCompletedCount / article.paragraphCount) * 100)
                        : 0;

                      return (
                        <button
                          key={article.articleTitle}
                          type="button"
                          onClick={() => setSelectedArticle(article.articleTitle)}
                          className="w-full text-left p-3 rounded-lg bg-base-200 hover:bg-base-300 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="text-sm line-clamp-1 flex-1">
                              {article.articleTitle}
                            </div>
                            <ChevronRight className="w-4 h-4 flex-shrink-0" />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="progress progress-accent h-1 flex-1">
                              <div
                                className="progress-value"
                                style={{ width: `${articleProgress}%` }}
                              />
                            </div>
                            <div className="text-xs font-mono flex-shrink-0 opacity-60">
                              {articleCompletedCount}/{article.paragraphCount}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              ) : null}

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
            </>
          )}
        </div>
      )}

      {previewParagraph && (
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs opacity-60 line-clamp-1">
                  {previewParagraph.bookTitle} → {previewParagraph.sequenceTitle}
                </div>
                <div className="font-medium line-clamp-1 mt-1">
                  {previewParagraph.articleTitle}
                </div>
              </div>
              <div className="badge badge-neutral badge-sm font-mono flex-shrink-0">
                {previewParagraph.wordCount}w
              </div>
            </div>
            <p className="text-sm opacity-70 line-clamp-3">
              {previewParagraph.content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
