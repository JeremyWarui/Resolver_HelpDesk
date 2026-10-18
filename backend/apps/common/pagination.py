"""Page-size policy. Two shapes, because there are two kinds of list.

`DefaultPagination` is the project default, set in `REST_FRAMEWORK`, so a view
names a pagination class only when it deviates: an append-only feed, or a list
short enough not to page at all.
"""

from rest_framework.pagination import CursorPagination, PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """Page numbers, and a client that may ask for a different page size.

    The size itself is `PAGE_SIZE` in settings — one number, in one place. All
    this adds over DRF's default is letting a caller override it, which the
    admin tables need and DRF does not enable on its own.
    """

    page_size_query_param = "page_size"
    max_page_size = 100


class AppendOnlyFeedPagination(CursorPagination):
    """For immutable append-only feeds: ticket logs and comments.

    Cursor-paged: rows are inserted while a reader pages, and a page number
    would repeat or skip one.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = ("-created_at", "id")
