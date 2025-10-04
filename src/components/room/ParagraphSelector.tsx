import { useQuery } from "convex/react";
import { CheckCircle, Circle } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { renderMarkdown } from "../../utils/markdown";

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

  if (!booksHierarchy) {
    return <div className="loading loading-spinner loading-sm" />;
  }

  const previewParagraph =
    mode === "next" && nextUncompleted
      ? nextUncompleted.paragraph
      : selectedParagraphDetails;

  return (
    <div className="space-y-3">
      <div className="tabs tabs-box tabs-sm w-full">
        <button
          type="button"
          className={`tab flex-1 ${mode === "random" ? "tab-active" : ""}`}
          onClick={() => handleModeChange("random")}
        >
          Random
        </button>
        {nextUncompleted && (
          <button
            type="button"
            className={`tab flex-1 ${mode === "next" ? "tab-active" : ""}`}
            onClick={() => handleModeChange("next")}
          >
            Next
          </button>
        )}
        <button
          type="button"
          className={`tab flex-1 ${mode === "choose" ? "tab-active" : ""}`}
          onClick={() => handleModeChange("choose")}
        >
          Browse
        </button>
      </div>

      {mode === "choose" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">
                {booksHierarchy.completedParagraphs} / {booksHierarchy.totalParagraphs} paragraphs
              </span>
              {(selectedBook || selectedSequence || selectedArticle) && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => {
                    setSelectedBook(null);
                    setSelectedSequence(null);
                    setSelectedArticle(null);
                    onSelectParagraph(null);
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto space-y-1">
              {booksHierarchy.books.map((book) => {
                const isBookExpanded = selectedBook === book.bookTitle;
                const bookCompletedCount = book.sequences.reduce((sum, s) => sum + s.completedParagraphs, 0);
                const bookTotalCount = book.sequences.reduce((sum, s) => sum + s.totalParagraphs, 0);

                return (
                  <details
                    key={book.bookTitle}
                    className="collapse collapse-arrow bg-base-200"
                    open={isBookExpanded}
                  >
                    <summary
                      className="collapse-title text-xs font-medium min-h-0 py-1.5 px-3 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        if (selectedBook === book.bookTitle) {
                          setSelectedBook(null);
                          setSelectedSequence(null);
                          setSelectedArticle(null);
                        } else {
                          setSelectedBook(book.bookTitle);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span>{book.bookTitle}</span>
                        <span className="opacity-60 font-mono text-[10px]">
                          {bookCompletedCount}/{bookTotalCount}
                        </span>
                      </div>
                    </summary>
                    <div className="collapse-content px-2 pb-1">
                      <div className="space-y-1">
                        {book.sequences.map((sequence) => {
                          const isSequenceExpanded = selectedSequence === sequence.sequenceTitle;

                          return (
                            <details
                              key={sequence.sequenceTitle}
                              className="collapse collapse-arrow bg-base-300"
                              open={isSequenceExpanded}
                            >
                              <summary
                                className="collapse-title text-[11px] min-h-0 py-1 px-2 cursor-pointer"
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (selectedSequence === sequence.sequenceTitle) {
                                    setSelectedSequence(null);
                                    setSelectedArticle(null);
                                  } else {
                                    setSelectedSequence(sequence.sequenceTitle);
                                  }
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="line-clamp-1">{sequence.sequenceTitle}</span>
                                  <span className="opacity-60 font-mono text-[10px] ml-2 flex-shrink-0">
                                    {sequence.completedParagraphs}/{sequence.totalParagraphs}
                                  </span>
                                </div>
                              </summary>
                              <div className="collapse-content px-1 pb-1">
                                <div className="space-y-0.5">
                                  {sequence.articles.map((article) => (
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
                                      className={`btn btn-xs w-full justify-between h-auto py-0.5 text-[10px] ${
                                        selectedArticle === article.articleTitle
                                          ? "btn-primary"
                                          : article.completedCount === article.paragraphCount
                                          ? "btn-ghost opacity-40"
                                          : "btn-ghost"
                                      }`}
                                    >
                                      <span className="text-left flex-1 line-clamp-1">
                                        {article.articleTitle}
                                      </span>
                                      <span className="opacity-60 font-mono ml-1 flex-shrink-0">
                                        {article.completedCount}/{article.paragraphCount}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>

            {selectedArticle && articleParagraphs && (
              <div className="mt-2 p-2 bg-base-200 rounded border border-base-300">
                <div className="text-xs font-medium mb-1.5">
                  {selectedArticle}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {articleParagraphs.paragraphs.map((para) => (
                    <button
                      key={para._id}
                      type="button"
                      onClick={() => onSelectParagraph(para._id)}
                      className={`btn btn-xs w-full justify-start h-auto py-1 text-left ${
                        selectedParagraphId === para._id
                          ? "btn-primary"
                          : para.completed
                          ? "btn-ghost opacity-40"
                          : "btn-ghost"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        {para.completed ? (
                          <CheckCircle className="w-3 h-3 text-success flex-shrink-0" />
                        ) : (
                          <Circle className="w-3 h-3 flex-shrink-0" />
                        )}
                        <span className="font-medium text-[10px]">
                          #{para.indexInArticle + 1}
                        </span>
                        <span className="flex-1 text-[10px] opacity-70 line-clamp-1">
                          {renderMarkdown(para.content)}
                        </span>
                        <span className="text-[10px] opacity-60 font-mono flex-shrink-0">
                          {para.wordCount}w
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {previewParagraph && (
        <div className="p-2.5 bg-base-200 rounded border border-base-300 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="opacity-60 line-clamp-1">
              {previewParagraph.bookTitle} → {previewParagraph.sequenceTitle}
            </span>
            <span className="badge badge-xs badge-ghost font-mono ml-2 flex-shrink-0">
              {previewParagraph.wordCount}w
            </span>
          </div>
          <div className="font-medium text-xs line-clamp-1">
            {previewParagraph.articleTitle} (#{previewParagraph.indexInArticle + 1})
          </div>
          <div className="text-xs opacity-70 line-clamp-2">
            {renderMarkdown(previewParagraph.content)}
          </div>
        </div>
      )}
    </div>
  );
}
