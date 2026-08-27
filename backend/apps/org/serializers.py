"""
Read and write shapes for the campuses and the service catalogue.

Reference data, not scoped: `org.views` decides who may read or write it.
"""

from rest_framework import serializers

from apps.accounts.identity import display_name
from apps.accounts.scope import post_holder
from apps.org.models import Campus, ServiceItem, SubSection


class CampusSerializer(serializers.ModelSerializer):
    """A campus, with who heads it and how many technicians work there.

    `hos` is read from the role row, never from a column on Campus: the role
    is the only record of a post, so there is no second copy to keep in step.
    """

    hos = serializers.SerializerMethodField()
    hos_name = serializers.SerializerMethodField()
    technician_count = serializers.SerializerMethodField()

    class Meta:
        model = Campus
        fields = [
            "id",
            "name",
            "code",
            "location",
            "hos",
            "hos_name",
            "technician_count",
        ]

    def get_hos(self, obj):
        """The id of whoever holds the HOS post here, or None.

        The viewset annotates it, so this is not a query per row; the fallback
        is for a Campus serialized outside that queryset.
        """
        if hasattr(obj, "hos_id_annotated"):
            return obj.hos_id_annotated
        holder = post_holder("hos", campus=obj)
        return holder.pk if holder else None

    def get_hos_name(self, obj):
        """Who heads this campus, by name."""
        holder = post_holder("hos", campus=obj)
        return display_name(holder) if holder else None

    def get_technician_count(self, obj):
        """The technician count, annotated by the viewset."""
        # A Campus serialized outside that queryset carries no annotation.
        if hasattr(obj, "technician_count"):
            return obj.technician_count
        return obj.technician_trades.values("user").distinct().count()


class ServiceItemSerializer(serializers.ModelSerializer):
    """A requestable service."""

    class Meta:
        model = ServiceItem
        fields = ["id", "sub_section", "name", "description", "is_active"]


class SubSectionSerializer(serializers.ModelSerializer):
    """A trade with its service items nested, for the ticket wizard."""

    items = ServiceItemSerializer(source="service_items", many=True, read_only=True)

    class Meta:
        model = SubSection
        fields = ["id", "name", "code", "description", "is_active", "items"]
        read_only_fields = ["items"]
